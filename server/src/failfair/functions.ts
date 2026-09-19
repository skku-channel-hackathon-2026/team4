import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  CaseSubmissionSchema,
  CATEGORIES,
  CommandActionInputSchema,
  CompareInputSchema,
  CompareOutputSchema,
  ConfirmSituationInputSchema,
  ConfirmSituationOutputSchema,
  FAILFAIR_ERRORS,
  FAILFAIR_FUNCTIONS,
  FAILFAIR_WAM_NAME,
  FeedbackInputSchema,
  GetCaseInputSchema,
  GetCaseOutputSchema,
  GetSessionInputSchema,
  ListCasesInputSchema,
  ListCasesOutputSchema,
  ModeSchema,
  OkOutputSchema,
  ReplyInputSchema,
  ReplyOutputSchema,
  ReviewCaseInputSchema,
  SessionViewSchema,
  StartInputSchema,
  StartOutputSchema,
  SubmitCaseOutputSchema,
  type Case,
  type CaseSubmission,
  type CommandActionInput,
} from "@tutorial/shared";
import {
  CommandResultSchema,
  Ctx,
  Description,
  Extension,
  Func,
  FunctionCallError,
  FunctionCallErrorCode,
  GetCommandsOutputSchema,
  Input,
  InputSchema,
  OutputSchema,
  type Context,
} from "@channel.io/app-sdk-server";
import { appId } from "../config.js";
import { getRecord, setRecord } from "../records.js";
import {
  AppRecordsCaseRepository,
  newCaseId,
  type CaseRepository,
} from "./case.repository.js";
import {
  createModelGateway,
  firstPrompt,
  summarizeSituation,
  type ModelGateway,
} from "./model-gateway.js";
import { matchActions } from "./retrieval.service.js";
import {
  SessionService,
  normalizeSituation,
  requireOwner,
  requireState,
  toView,
} from "./session.service.js";

const RECORD_FEEDBACK = "failfair:feedback";

@Extension({ name: "command", systemVersion: "v1" })
export class CommandExtension {
  @Func("metadata.getCommands")
  @Description("망한 선배 박람회 커맨드 정의")
  @InputSchema(z.object({}))
  @OutputSchema(GetCommandsOutputSchema)
  getCommands(): z.infer<typeof GetCommandsOutputSchema> {
    return {
      commands: [
        {
          name: "failfair",
          scope: "desk",
          description:
            "망한 선배 박람회: 상황을 말하면 비슷하게 망했던 선배의 기록을 찾아요",
          nameDescI18nMap: {
            ko: {
              name: "망선박",
              description:
                "망한 선배 박람회: 상황을 말하면 비슷하게 망했던 선배의 기록을 찾아요",
            },
            en: {
              name: "failfair",
              description: "Find what happened to seniors who failed like you",
            },
          },
          actionFunctionName: FAILFAIR_FUNCTIONS.open,
          alfMode: "disable",
          enabledByDefault: true,
          paramDefinitions: [
            {
              name: "mode",
              type: "string",
              required: false,
              description: "학생으로 상담할지, 선배로 사례를 남길지",
              choices: [
                { name: "학생", value: "student" },
                { name: "선배", value: "senior" },
              ],
            },
          ],
        },
      ],
    };
  }
}

@Injectable()
export class FailfairFunctions {
  private readonly sessions = new SessionService();
  private readonly cases: CaseRepository = new AppRecordsCaseRepository();
  private readonly model: ModelGateway = createModelGateway();

  // ---------------------------------------------------------------- 진입

  @Func(FAILFAIR_FUNCTIONS.open)
  @Description("망한 선배 박람회 WAM 열기")
  @InputSchema(CommandActionInputSchema)
  @OutputSchema(CommandResultSchema)
  open(
    @Ctx() ctx: Context,
    @Input() params: CommandActionInput,
  ): z.infer<typeof CommandResultSchema> {
    return this.openWam(ctx, params);
  }

  /** 커맨드 등록 갱신 전까지 Desk에 남아 있는 `/tutorial`도 같은 화면을 연다. */
  @Func(FAILFAIR_FUNCTIONS.legacyOpen)
  @Description("망한 선배 박람회 WAM 열기 (이전 커맨드 이름 호환)")
  @InputSchema(CommandActionInputSchema)
  @OutputSchema(CommandResultSchema)
  legacyOpen(
    @Ctx() ctx: Context,
    @Input() params: CommandActionInput,
  ): z.infer<typeof CommandResultSchema> {
    return this.openWam(ctx, params);
  }

  private openWam(
    ctx: Context,
    params: CommandActionInput,
  ): z.infer<typeof CommandResultSchema> {
    const mode = ModeSchema.safeParse(params.input.mode);
    return {
      type: "wam",
      attributes: {
        appId,
        name: FAILFAIR_WAM_NAME,
        wamArgs: {
          chatId: params.chat?.id ?? "",
          chatType: params.chat?.type ?? "",
          chatTitle: params.trigger?.attributes?.chatTitle ?? "",
          mode: mode.success ? mode.data : undefined,
          // 호스트가 주지 않는 방(예: 나와의 대화방)도 있어 서버가 함께 넣는다.
          appId,
          channelId: ctx.channel.id,
          managerId: ctx.caller.id ?? "",
        },
      },
    };
  }

  // ---------------------------------------------------------------- 학생 대화

  @Func(FAILFAIR_FUNCTIONS.start)
  @Description("카테고리를 고르고 대화 세션을 연다")
  @InputSchema(StartInputSchema)
  @OutputSchema(StartOutputSchema)
  async start(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof StartInputSchema>,
  ): Promise<z.infer<typeof StartOutputSchema>> {
    const prompt = firstPrompt(input.category);
    const session = await this.sessions.create(ctx, input.category, prompt);
    return {
      sessionId: session.id,
      state: session.state,
      revision: session.revision,
      assistantMessage: prompt,
    };
  }

  @Func(FAILFAIR_FUNCTIONS.reply)
  @Description(
    "학생 메시지를 받아 상황을 갱신하고 다음 질문 또는 확인 요약을 돌려준다",
  )
  @InputSchema(ReplyInputSchema)
  @OutputSchema(ReplyOutputSchema)
  async reply(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof ReplyInputSchema>,
  ): Promise<z.infer<typeof ReplyOutputSchema>> {
    const session = await this.sessions.load(ctx, input.sessionId);
    requireState(session, ["COLLECTING", "REVIEWING_SITUATION", "RESULTS"]);
    return this.sessions.mutate(
      session,
      input.requestId,
      input.expectedRevision,
      async (current) => {
        const now = Date.now();
        current.messages.push({
          role: "student",
          content: input.message,
          at: now,
        });
        const analyzed = await this.model.analyze({
          category: current.category,
          situation: current.situation,
          messages: current.messages,
          message: input.message,
          pendingField: current.pendingField,
          questionCount: current.questionCount,
        });
        current.situation = normalizeSituation(analyzed.situation);
        current.results = [];
        current.actions = [];

        let assistantMessage: string;
        if (analyzed.readyToConfirm || !analyzed.nextQuestion) {
          current.state = "REVIEWING_SITUATION";
          current.pendingField = undefined;
          assistantMessage = summarizeSituation(current.situation);
        } else {
          current.state = "COLLECTING";
          current.pendingField = analyzed.pendingField;
          current.questionCount += 1;
          assistantMessage = analyzed.nextQuestion;
        }
        current.messages.push({
          role: "assistant",
          content: assistantMessage,
          at: now + 1,
        });
        return {
          state: current.state,
          revision: current.revision + 1,
          assistantMessage,
          situation: current.situation,
        };
      },
    );
  }

  @Func(FAILFAIR_FUNCTIONS.confirmSituation)
  @Description("학생이 확인·수정한 상황을 고정하고 행동 후보를 만든다")
  @InputSchema(ConfirmSituationInputSchema)
  @OutputSchema(ConfirmSituationOutputSchema)
  async confirmSituation(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof ConfirmSituationInputSchema>,
  ): Promise<z.infer<typeof ConfirmSituationOutputSchema>> {
    const session = await this.sessions.load(ctx, input.sessionId);
    requireState(session, [
      "REVIEWING_SITUATION",
      "REVIEWING_ACTIONS",
      "RESULTS",
    ]);
    if (input.situation.category !== session.category) {
      throw new FunctionCallError(
        "Category cannot change inside a session. Start a new one.",
        FunctionCallErrorCode.BadRequest,
        { type: FAILFAIR_ERRORS.invalidInput },
      );
    }
    return this.sessions.mutate(
      session,
      input.requestId,
      input.expectedRevision,
      async (current) => {
        current.situation = normalizeSituation(input.situation);
        current.confirmedRevision = current.revision + 1;
        current.actions = await this.model.suggestActions(current.situation);
        current.results = [];
        current.state = "REVIEWING_ACTIONS";
        return {
          state: current.state,
          revision: current.revision + 1,
          situation: current.situation,
          actions: current.actions,
        };
      },
    );
  }

  @Func(FAILFAIR_FUNCTIONS.compare)
  @Description("확인한 행동마다 선배 사례를 찾아 비교 카드를 만든다")
  @InputSchema(CompareInputSchema)
  @OutputSchema(CompareOutputSchema)
  async compare(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof CompareInputSchema>,
  ): Promise<z.infer<typeof CompareOutputSchema>> {
    const session = await this.sessions.load(ctx, input.sessionId);
    requireState(session, ["REVIEWING_ACTIONS", "RESULTS"]);
    if (session.confirmedRevision === undefined) {
      throw new FunctionCallError(
        "Confirm the situation before comparing",
        FunctionCallErrorCode.Conflict,
        { type: FAILFAIR_ERRORS.inProgress },
      );
    }
    const cases = await this.cases.listApproved(session.category);
    return this.sessions.mutate(
      session,
      input.requestId,
      input.expectedRevision,
      (current) => {
        current.actions = input.actions;
        current.results = matchActions(
          current.situation,
          current.actions,
          cases,
        );
        current.state = "RESULTS";
        const demo = current.results.some(
          (result) => result.sourceType === "demo",
        );
        return {
          state: current.state,
          revision: current.revision + 1,
          results: current.results,
          notice:
            "비슷한 경험을 한 선배의 기록입니다. 상황의 차이에 따라 결과는 달라질 수 있습니다." +
            (demo ? " 일부 사례는 가상 시연 데이터입니다." : ""),
        };
      },
    );
  }

  @Func(FAILFAIR_FUNCTIONS.getSession)
  @Description("본인 세션의 현재 상태와 대화·결과")
  @InputSchema(GetSessionInputSchema)
  @OutputSchema(SessionViewSchema)
  async getSession(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof GetSessionInputSchema>,
  ): Promise<z.infer<typeof SessionViewSchema>> {
    return toView(await this.sessions.load(ctx, input.sessionId));
  }

  @Func(FAILFAIR_FUNCTIONS.getCase)
  @Description("결과에 연결된 승인 사례의 상세와 도구")
  @InputSchema(GetCaseInputSchema)
  @OutputSchema(GetCaseOutputSchema)
  async getCase(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof GetCaseInputSchema>,
  ): Promise<z.infer<typeof GetCaseOutputSchema>> {
    await this.sessions.load(ctx, input.sessionId);
    const item = await this.cases.get(input.caseId);
    if (!item || item.status !== "approved") {
      throw new FunctionCallError(
        "Case not found",
        FunctionCallErrorCode.NotFound,
        {
          type: FAILFAIR_ERRORS.notFoundOrForbidden,
        },
      );
    }
    return { case: item };
  }

  @Func(FAILFAIR_FUNCTIONS.feedback)
  @Description("도움 됨·도구 복사 신호 기록")
  @InputSchema(FeedbackInputSchema)
  @OutputSchema(OkOutputSchema)
  async feedback(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof FeedbackInputSchema>,
  ): Promise<z.infer<typeof OkOutputSchema>> {
    await this.sessions.load(ctx, input.sessionId);
    const stored = await getRecord<unknown[]>(RECORD_FEEDBACK);
    const list = Array.isArray(stored) ? stored : [];
    if (
      !list.some(
        (entry) =>
          (entry as { requestId?: string }).requestId === input.requestId,
      )
    ) {
      list.push({ ...input, at: Date.now() });
      await setRecord(RECORD_FEEDBACK, list);
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- 선배 입력·검수

  @Func(FAILFAIR_FUNCTIONS.submitCase)
  @Description("선배가 실패 사례를 등록한다. 검수 전에는 draft로 보관된다")
  @InputSchema(CaseSubmissionSchema)
  @OutputSchema(SubmitCaseOutputSchema)
  async submitCase(
    @Ctx() ctx: Context,
    @Input() input: CaseSubmission,
  ): Promise<z.infer<typeof SubmitCaseOutputSchema>> {
    const managerId = requireOwner(ctx);
    const item: Case = {
      ...input,
      id: newCaseId(),
      status: "draft",
      sourceType: "real",
      version: 1,
      authorManagerId: input.allowContact ? managerId : undefined,
      createdAt: Date.now(),
    };
    await this.cases.save(item);
    return { case: item };
  }

  @Func(FAILFAIR_FUNCTIONS.listCases)
  @Description("검수용 사례 목록. 상태로 거른다")
  @InputSchema(ListCasesInputSchema)
  @OutputSchema(ListCasesOutputSchema)
  async listCases(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof ListCasesInputSchema>,
  ): Promise<z.infer<typeof ListCasesOutputSchema>> {
    requireOwner(ctx);
    return { cases: await this.cases.list(input.status) };
  }

  @Func(FAILFAIR_FUNCTIONS.reviewCase)
  @Description("사례 상태를 바꾼다 (draft → approved / hidden)")
  @InputSchema(ReviewCaseInputSchema)
  @OutputSchema(SubmitCaseOutputSchema)
  async reviewCase(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof ReviewCaseInputSchema>,
  ): Promise<z.infer<typeof SubmitCaseOutputSchema>> {
    requireOwner(ctx);
    const item = await this.cases.get(input.caseId);
    if (!item) {
      throw new FunctionCallError(
        "Case not found",
        FunctionCallErrorCode.NotFound,
        {
          type: FAILFAIR_ERRORS.notFoundOrForbidden,
        },
      );
    }
    const updated: Case = {
      ...item,
      status: input.status,
      version: item.version + 1,
    };
    await this.cases.save(updated);
    return { case: updated };
  }
}

export const FAILFAIR_CATEGORY_NAMES = CATEGORIES.map(
  (category) => category.name,
);
