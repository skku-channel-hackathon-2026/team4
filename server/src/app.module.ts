import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ChannelAppModule, SignatureGuard } from "@channel.io/app-sdk-server";
import { channelAppOptions } from "./config.js";
import { CommandExtension, FailfairFunctions } from "./failfair/functions.js";

@Module({
  imports: [ChannelAppModule.forRoot(channelAppOptions)],
  providers: [
    CommandExtension,
    FailfairFunctions,
    {
      provide: APP_GUARD,
      useFactory: () => new SignatureGuard(channelAppOptions),
    },
  ],
})
export class AppModule {}
