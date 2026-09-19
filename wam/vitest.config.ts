import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * WAM 화면 테스트. jsdom에서 App을 그대로 렌더하고 가짜 ChannelIOWam bridge로
 * 서버 응답을 흉내 낸다. 브라우저를 띄우지 않으므로 CI에서 바로 돈다.
 */
export default defineConfig({
  plugins: [react()],
  // 인라인한 패키지들이 소스가 빠진 sourcemap을 달고 있어 경고가 쏟아진다.
  logLevel: 'error',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    /*
     * 채널톡 UI 패키지와 styled-components는 CJS로 배포돼서, 그대로
     * externalize하면 기본 내보내기가 객체로 잡혀 `styled.div is not a function`이
     * 난다. Vite가 직접 변환하도록 인라인한다.
     */
    server: {
      deps: { inline: [/@channel\.io/, 'styled-components'] },
    },
  },
})
