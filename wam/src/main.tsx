import ReactDOM from 'react-dom/client'
import { WamProvider } from '@channel.io/app-sdk-wam'

import App from './App.tsx'
import { installDevBridge } from './devBridge'
import '@channel.io/bezier-react/styles.css'
import './index.css'

installDevBridge()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <WamProvider>
    <App />
  </WamProvider>
)
