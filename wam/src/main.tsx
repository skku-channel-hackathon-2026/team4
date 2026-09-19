import ReactDOM from 'react-dom/client'
import { WamProvider } from '@channel.io/app-sdk-wam'

import App from './App.tsx'
import { installDevBridge } from './devBridge'
import '@channel.io/bezier-react/styles.css'
import './index.css'

// dev bridge는 server 모드에서 서명된 채팅방 표식을 서버에서 한 번 받아 오므로
// 비동기다. 실제 호스트에서는 아무것도 하지 않고 곧바로 통과한다.
void installDevBridge().then(() => {
  // index.html이 테마를 html[data-appearance]에 적어 두지만, 그 스크립트가 돌 때
  // 호스트가 아직 ChannelIOWam을 심지 않았을 수 있다(주입 지연, 그리고 dev에서는
  // 위의 bridge가 그 뒤에 생긴다). 그때는 OS 설정만 보고 지나가므로 여기서 한 번
  // 더 맞춰, 스킨이 WamThemeProvider가 고른 Bezier 테마와 어긋나지 않게 한다.
  const appearance = window.ChannelIOWam?.getWamData('appearance')
  if (typeof appearance === 'string') {
    document.documentElement.dataset.appearance =
      appearance === 'dark' ? 'dark' : 'light'
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <WamProvider>
      <App />
    </WamProvider>
  )
})
