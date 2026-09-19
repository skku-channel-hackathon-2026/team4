import { Injectable, Optional } from "@nestjs/common";
import { reconcileConfirmedContext } from "./student-context.js";
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
  SosListInputSchema,
  SosListOutputSchema,
  SosRequestInputSchema,
  SosRequestOutputSchema,
  SosRespondInputSchema,
  SosRespondOutputSchema,
  SosSendInputSchema,
  SosSendOutputSchema,
  SosThreadInputSchema,
  SosThreadOutputSchema,
  ModelStatusSchema,
  SetModelInputSchema,
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
  NativeFunctionClient,
  OutputSchema,
  TokenManager,
  type Context,
} from "@channel.io/app-sdk-server";
import { appId, appSecret } from "../config.js";
import {
  createTutorialTargetToken,
  verifyChatTarget,
} from "../target-token.js";
import {
  D1CaseRepository,
  newCaseId,
  type CaseRepository,
} from "./case.repository.js";
import { recordFeedback } from "./feedback.store.js";
import { ModelGatewayResolver } from "./model-config.service.js";
import { firstPrompt, summarizeSituation } from "./model-gateway.js";
import {
  ChannelGroupNotifier,
  silentNotifier,
  type GroupNotifier,
} from "./notifier.js";
import { matchActions } from "./retrieval.service.js";
import {
  SosService,
  chooseContactableCase,
  isContactable,
  sosDirectAcceptedText,
  sosDirectRequestText,
  sosRequestedText,
  sosRespondedText,
} from "./sos.service.js";
import {
  SessionService,
  normalizeSituation,
  requireOwner,
  requireState,
  toView,
} from "./session.service.js";

/** SOS 대상 표식의 수명. 한 번 연 WAM에서 상담을 마치기에 넉넉하고, 오래 새지 않을 정도. */
const CHAT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

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
  private readonly cases: CaseRepository = new D1CaseRepository();
  private readonly models = new ModelGatewayResolver();
  private readonly sos = new SosService();
  private readonly notifier: GroupNotifier;

  constructor(
    @Optional() tokens?: TokenManager,
    @Optional() native?: NativeFunctionClient,
  ) {
    // SDK 모듈이 토큰·네이티브 클라이언트를 주면 그룹 봇 알림을 켠다. 없으면(단위 테스트) 조용히 건너뛴다.
    this.notifier =
      tokens && native
        ? new ChannelGroupNotifier(tokens, native)
        : silentNotifier;
  }

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
    const chatId = params.chat?.id ?? "";
    const chatType = params.chat?.type ?? "";
    const chatTitle = params.trigger?.attributes?.chatTitle ?? "";
    const managerId = ctx.caller.id ?? "";
    // SOS 알림이 갈 방은 여기서만 정해진다. 호스트가 알려 준 방을 서명해 두고,
    // 나중에 클라이언트가 부르는 chatId 대신 이 표식을 믿는다.
    const chatToken =
      chatType === "group" && chatId && managerId
        ? createTutorialTargetToken(
            {
              channelId: ctx.channel.id,
              groupId: chatId,
              managerId,
              chatTitle,
              expiresAt: Date.now() + CHAT_TOKEN_TTL_MS,
            },
            appSecret,
          )
        : "";
    return {
      type: "wam",
      attributes: {
        appId,
        name: FAILFAIR_WAM_NAME,
        wamArgs: {
          chatId,
          chatType,
          chatTitle,
          chatToken,
          mode: mode.success ? mode.data : undefined,
          // 채널톡 WAM URL에는 로컬 쿼리 파라미터가 없으므로 서버가 직접 켠다.
          demoVoice: true,
          // 호스트가 주지 않는 방(예: 나와의 대화방)도 있어 서버가 함께 넣는다.
          appId,
          channelId: ctx.channel.id,
          managerId,
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
        const model = await this.models.resolve();
        const analyzed = await model.analyze({
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
        current.situation = normalizeSituation(
          reconcileConfirmedContext(
            current.situation,
            input.situation,
            current.messages,
          ),
        );
        current.confirmedRevision = current.revision + 1;
        const model = await this.models.resolve();
        current.actions = await model.suggestActions(current.situation);
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
    return {
      case: item,
      contactable: isContactable(item, ctx.caller.id ?? ""),
    };
  }

  @Func(FAILFAIR_FUNCTIONS.feedback)
  @Description("도움 됨·도구 복사 신호 기록")
  @InputSchema(FeedbackInputSchema)
  @OutputSchema(OkOutputSchema)
  async feedback(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof FeedbackInputSchema>,
  ): Promise<z.infer<typeof OkOutputSchema>> {
    const session = await this.sessions.load(ctx, input.sessionId);
    // 결과 카드에 연결된 사례를 같이 남겨 두면 사례별 "도움 됨"을 셀 수 있다. 재전송은 한 번만 쌓인다.
    const result = session.results.find((entry) => entry.id === input.resultId);
    await recordFeedback({
      requestId: input.requestId,
      sessionId: session.id,
      resultId: input.resultId,
      caseId: result?.caseId,
      event: input.event,
      at: Date.now(),
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------- 선배 입력·검수

  // ---------------------------------------------------------------- SOS

  @Func(FAILFAIR_FUNCTIONS.sosRequest)
  @Description(
    "새내기가 연락 가능한 실제 선배에게 SOS를 보낸다. 사례를 안 고르면 서버가 매칭한다. 두 사람의 DM을 열고, 그룹에서 열었으면 그 방에도 봇 알림을 올린다",
  )
  @InputSchema(SosRequestInputSchema)
  @OutputSchema(SosRequestOutputSchema)
  async sosRequest(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SosRequestInputSchema>,
  ): Promise<z.infer<typeof SosRequestOutputSchema>> {
    const managerId = requireOwner(ctx);
    // 봇 알림이 갈 그룹은 `open`에서 서명해 둔 표식으로만 정한다. 그래야 다른 그룹을
    // 겨냥해 봇 메시지를 올릴 수 없다. 표식이 없으면(그룹이 아닌 방) 그룹 알림만 건너뛴다.
    const target = verifyChatTarget(input.chatTarget, appSecret, {
      channelId: ctx.channel.id,
      managerId,
    });
    const session = await this.sessions.load(ctx, input.sessionId);
    let item: Case | undefined;
    if (input.caseId) {
      item = await this.cases.get(input.caseId);
      if (!item || item.status !== "approved") {
        throw new FunctionCallError(
          "Case not found",
          FunctionCallErrorCode.NotFound,
          { type: FAILFAIR_ERRORS.notFoundOrForbidden },
        );
      }
    } else {
      // 매칭: 이 대화의 결과에 연결된 선배를 우선, 없으면 같은 카테고리의 연락 허용 선배.
      item = chooseContactableCase(
        await this.cases.listApproved(session.category),
        session.results.flatMap((result) =>
          result.caseId ? [result.caseId] : [],
        ),
        managerId,
      );
      if (!item) {
        throw new FunctionCallError(
          "No contactable senior in this category yet",
          FunctionCallErrorCode.NotFound,
          { type: FAILFAIR_ERRORS.noSeniorAvailable },
        );
      }
    }
    const { request, created } = await this.sos.request({
      item,
      channelId: ctx.channel.id,
      chatId: target?.groupId ?? "",
      chatType: target ? "group" : "",
      chatTitle: target?.chatTitle ?? "",
      studentManagerId: managerId,
      message: input.message,
      requestId: input.requestId,
    });
    if (!created) return { request, notified: false, directChat: false };

    // 1) 두 사람 사이 채널톡 DM을 열고 새내기 이름으로 SOS 문구를 올린다. 선배는 DM 알림을 받는다.
    //    앱에 권한이 없으면 조용히 건너뛴다. 그래도 요청은 저장돼 선배 수신함에 보인다.
    let directChat = false;
    const directChatId = await this.notifier.openDirectChat({
      channelId: ctx.channel.id,
      managerIds: [request.studentManagerId, request.seniorManagerId],
    });
    if (directChatId) {
      await this.sos.attachDirectChat(request, directChatId);
      directChat = await this.notifier.writeDirect({
        channelId: ctx.channel.id,
        directChatId,
        managerId: request.studentManagerId,
        text: sosDirectRequestText(request),
      });
    }
    // 2) 그룹에서 열었으면 그 방에도 봇 알림.
    const notified = await this.notifier.notify({
      channelId: ctx.channel.id,
      chatId: request.chatId,
      chatType: request.chatType,
      text: sosRequestedText(request),
    });
    return { request, notified, directChat };
  }

  @Func(FAILFAIR_FUNCTIONS.sosList)
  @Description("내가 보낸(student) 또는 나에게 온(senior) SOS 요청 목록")
  @InputSchema(SosListInputSchema)
  @OutputSchema(SosListOutputSchema)
  async sosList(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SosListInputSchema>,
  ): Promise<z.infer<typeof SosListOutputSchema>> {
    const managerId = requireOwner(ctx);
    return {
      requests: await this.sos.listFor(ctx.channel.id, managerId, input.role),
    };
  }

  @Func(FAILFAIR_FUNCTIONS.sosRespond)
  @Description(
    "선배가 SOS를 수락하거나 거절한다. 요청이 시작된 그룹 채팅에 봇 알림을 올린다",
  )
  @InputSchema(SosRespondInputSchema)
  @OutputSchema(SosRespondOutputSchema)
  async sosRespond(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SosRespondInputSchema>,
  ): Promise<z.infer<typeof SosRespondOutputSchema>> {
    const managerId = requireOwner(ctx);
    const { request, changed } = await this.sos.respond(
      ctx.channel.id,
      managerId,
      input.sosId,
      input.status,
    );
    if (!changed) return { request, notified: false, directChat: false };
    const directChat =
      request.status === "accepted" && request.directChatId
        ? await this.notifier.writeDirect({
            channelId: ctx.channel.id,
            directChatId: request.directChatId,
            managerId: request.seniorManagerId,
            text: sosDirectAcceptedText(request),
          })
        : false;
    const notified = await this.notifier.notify({
      channelId: ctx.channel.id,
      chatId: request.chatId,
      chatType: request.chatType,
      text: sosRespondedText(request),
    });
    return { request, notified, directChat };
  }

  @Func(FAILFAIR_FUNCTIONS.sosThread)
  @Description(
    "SOS의 최신 상태와 앱 안에서 주고받은 말. 두 당사자만 볼 수 있다",
  )
  @InputSchema(SosThreadInputSchema)
  @OutputSchema(SosThreadOutputSchema)
  async sosThread(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SosThreadInputSchema>,
  ): Promise<z.infer<typeof SosThreadOutputSchema>> {
    const managerId = requireOwner(ctx);
    return this.sos.thread(ctx.channel.id, managerId, input.sosId);
  }

  @Func(FAILFAIR_FUNCTIONS.sosSend)
  @Description(
    "수락된 SOS 안에서 말을 보낸다. 두 당사자만, 같은 requestId는 한 번만",
  )
  @InputSchema(SosSendInputSchema)
  @OutputSchema(SosSendOutputSchema)
  async sosSend(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SosSendInputSchema>,
  ): Promise<z.infer<typeof SosSendOutputSchema>> {
    const managerId = requireOwner(ctx);
    const message = await this.sos.send(
      ctx.channel.id,
      managerId,
      input.sosId,
      input.requestId,
      input.text,
    );
    return { message };
  }

  // ---------------------------------------------------------------- 모델 설정

  @Func(FAILFAIR_FUNCTIONS.getModel)
  @Description("지금 어떤 모델 게이트웨이가 도는지 (값은 돌려주지 않음)")
  @InputSchema(z.object({}))
  @OutputSchema(ModelStatusSchema)
  async getModel(
    @Ctx() ctx: Context,
  ): Promise<z.infer<typeof ModelStatusSchema>> {
    requireOwner(ctx);
    return this.models.describe();
  }

  @Func(FAILFAIR_FUNCTIONS.setModel)
  @Description(
    "환경 변수가 없을 때 Desk에서 Gemini를 켜거나 끈다. 운영진 비밀 변수가 있으면 그것이 우선",
  )
  @InputSchema(SetModelInputSchema)
  @OutputSchema(ModelStatusSchema)
  async setModel(
    @Ctx() ctx: Context,
    @Input() input: z.infer<typeof SetModelInputSchema>,
  ): Promise<z.infer<typeof ModelStatusSchema>> {
    const managerId = requireOwner(ctx);
    if (input.provider === "gemini" && !input.apiKey) {
      throw new FunctionCallError(
        "API key is required to enable Gemini",
        FunctionCallErrorCode.BadRequest,
        { type: FAILFAIR_ERRORS.invalidInput },
      );
    }
    await this.models.save({
      provider: input.provider,
      apiKey: input.provider === "gemini" ? input.apiKey : "",
      model: input.model,
      updatedAt: Date.now(),
      byManagerId: managerId,
    });
    return this.models.describe();
  }

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
