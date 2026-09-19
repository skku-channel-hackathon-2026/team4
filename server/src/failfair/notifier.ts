import type {
  NativeFunctionClient,
  TokenManager,
} from "@channel.io/app-sdk-server";

/**
 * SOS 알림 통로. 어느 것도 요청 흐름을 막지 않는다: 실패하면 false/undefined를 돌려주고
 * 요청은 그대로 저장된다.
 */
export interface GroupNotifier {
  /** 그룹 채팅에 봇 메시지를 올린다. 그룹이 아니거나 실패하면 false. */
  notify(input: {
    channelId: string;
    chatId: string;
    chatType: string;
    text: string;
  }): Promise<boolean>;
  /**
   * 두 매니저 사이 채널톡 1:1 DM을 찾거나 연다. 앱에 `findOrCreateDirectChat` 권한이
   * 없거나 실패하면 undefined.
   */
  openDirectChat(input: {
    channelId: string;
    managerIds: string[];
  }): Promise<string | undefined>;
  /**
   * 그 DM에 특정 매니저 이름으로 말을 올린다 (`writeDirectChatMessageAsManager`).
   * 새내기의 SOS 문구를 새내기 이름으로, 선배의 수락을 선배 이름으로 올려서
   * 두 사람이 바로 이어서 대화할 수 있게 한다. 실패하면 false.
   */
  writeDirect(input: {
    channelId: string;
    directChatId: string;
    managerId: string;
    text: string;
  }): Promise<boolean>;
}

export const silentNotifier: GroupNotifier = {
  notify: async () => false,
  openDirectChat: async () => undefined,
  writeDirect: async () => false,
};

const BOT_NAME = "망선박";

/** 채널톡 네이티브 함수로 알림을 보낸다. 앱에 해당 권한이 있어야 한다. */
export class ChannelGroupNotifier implements GroupNotifier {
  constructor(
    private readonly tokens: TokenManager,
    private readonly native: NativeFunctionClient,
    private readonly log: (message: string) => void = (message) =>
      console.warn(message),
  ) {}

  private async token(channelId: string): Promise<string> {
    const token = await this.tokens.getChannelToken({ channelId });
    return token.accessToken;
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : "unknown";
  }

  async notify(input: {
    channelId: string;
    chatId: string;
    chatType: string;
    text: string;
  }): Promise<boolean> {
    if (input.chatType !== "group" || !input.chatId) return false;
    try {
      const api = this.native.createProxyApi(await this.token(input.channelId));
      await api.writeGroupMessage({
        channelId: input.channelId,
        groupId: input.chatId,
        dto: { plainText: input.text, botName: BOT_NAME },
      });
      return true;
    } catch (error) {
      this.log(`SOS 그룹 알림 실패 (${this.reason(error)}); 요청은 저장됨`);
      return false;
    }
  }

  async openDirectChat(input: {
    channelId: string;
    managerIds: string[];
  }): Promise<string | undefined> {
    try {
      const result = await this.native.callNativeFunctionWithToken(
        "findOrCreateDirectChat",
        { channelId: input.channelId, managerIds: input.managerIds },
        await this.token(input.channelId),
      );
      const id = result?.directChat?.id;
      return typeof id === "string" && id ? id : undefined;
    } catch (error) {
      this.log(
        `SOS DM 열기 실패 (${this.reason(error)}); 앱 권한 findOrCreateDirectChat 확인`,
      );
      return undefined;
    }
  }

  async writeDirect(input: {
    channelId: string;
    directChatId: string;
    managerId: string;
    text: string;
  }): Promise<boolean> {
    try {
      const api = this.native.createProxyApi(await this.token(input.channelId));
      await api.writeDirectChatMessageAsManager({
        channelId: input.channelId,
        directChatId: input.directChatId,
        dto: { plainText: input.text, managerId: input.managerId },
      });
      return true;
    } catch (error) {
      this.log(
        `SOS DM 전송 실패 (${this.reason(error)}); 앱 권한 writeDirectChatMessageAsManager 확인`,
      );
      return false;
    }
  }
}
