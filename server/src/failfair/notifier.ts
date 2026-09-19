import type {
  NativeFunctionClient,
  TokenManager,
} from "@channel.io/app-sdk-server";

export interface GroupNotifier {
  /** 그룹 채팅에 봇 메시지를 올린다. 그룹이 아니거나 실패하면 false. 요청 흐름을 막지 않는다. */
  notify(input: {
    channelId: string;
    chatId: string;
    chatType: string;
    text: string;
  }): Promise<boolean>;
}

export const silentNotifier: GroupNotifier = {
  notify: async () => false,
};

const BOT_NAME = "망선박";

/** 채널톡 네이티브 함수 writeGroupMessage로 봇 메시지를 보낸다. 앱에 해당 권한이 있어야 한다. */
export class ChannelGroupNotifier implements GroupNotifier {
  constructor(
    private readonly tokens: TokenManager,
    private readonly native: NativeFunctionClient,
    private readonly log: (message: string) => void = (message) =>
      console.warn(message),
  ) {}

  async notify(input: {
    channelId: string;
    chatId: string;
    chatType: string;
    text: string;
  }): Promise<boolean> {
    if (input.chatType !== "group" || !input.chatId) return false;
    try {
      const token = await this.tokens.getChannelToken({
        channelId: input.channelId,
      });
      const api = this.native.createProxyApi(token.accessToken);
      await api.writeGroupMessage({
        channelId: input.channelId,
        groupId: input.chatId,
        dto: { plainText: input.text, botName: BOT_NAME },
      });
      return true;
    } catch (error) {
      this.log(
        `SOS 그룹 알림 실패 (${error instanceof Error ? error.message : "unknown"}); 요청은 저장됨`,
      );
      return false;
    }
  }
}
