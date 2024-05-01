import { WagmiProvider, createConfig, http } from 'wagmi'
import { polygonAmoy } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWeb3Modal, useWeb3Modal, useWeb3ModalEvents, useWeb3ModalState, useWeb3ModalTheme } from '@web3modal/wagmi/react'
import { walletConnect } from 'wagmi/connectors'
import { metaKeep } from './connectors/metaKeep'

const projectId = import.meta.env.VITE_PROJECT_ID
const appId = import.meta.env.VITE_METAKEEP_APP_ID
if (!projectId || !appId) {
  throw new Error('VITE_PROJECT_ID is not set')
}

const queryClient = new QueryClient()

const config = createConfig({
  chains: [polygonAmoy],
  transports: {
    [polygonAmoy.id]: http('https://polygon-amoy-bor-rpc.publicnode.com'),
  },
  connectors: [
    metaKeep({ appId }),
    walletConnect({ projectId }),
  ],
})

createWeb3Modal({
  wagmiConfig: config,
  projectId,
  themeMode: 'light',
  themeVariables: {
    '--w3m-color-mix': '#00DCFF',
    '--w3m-color-mix-strength': 20
  }
})

function App() {

  const modal = useWeb3Modal()
  const state = useWeb3ModalState()
  const { themeMode, themeVariables, setThemeMode } = useWeb3ModalTheme()
  const events = useWeb3ModalEvents()

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <w3m-button />
        <w3m-network-button />
        <w3m-connect-button />
        <w3m-account-button />

        <button onClick={() => modal.open()}>Connect Wallet</button>
        <button onClick={() => modal.open({ view: 'Networks' })}>Choose Network</button>
        <button onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}>
          Toggle Theme Mode
        </button>
        <pre>{JSON.stringify(state, null, 2)}</pre>
        <pre>{JSON.stringify({ themeMode, themeVariables }, null, 2)}</pre>
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App
