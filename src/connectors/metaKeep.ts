import { createConnector, ChainNotConfiguredError } from '@wagmi/core'
import type { Evaluate, ExactPartial } from '@wagmi/core/internal'
import * as ethers from 'ethers';
import {
  type Address,
  type ProviderConnectInfo,
  ResourceUnavailableRpcError,
  RpcError,
  SwitchChainError,
  UserRejectedRequestError,
  getAddress,
  numberToHex,
} from 'viem'

export type MetaKeepParameters = Evaluate<
  ExactPartial<{ appId: string; user?: { email: string } }>
>

metaKeep.type = 'metaKeep' as const
export function metaKeep(parameters: MetaKeepParameters = {}) {
  type Provider = ethers.ethers.providers.Web3Provider
  type Properties = {
    onConnect(connectInfo: ProviderConnectInfo): void
  }
  type StorageItem = { 'metaKeep.disconnected': true }
  type Listener = Parameters<Provider['on']>[1]

  let provider: Provider | undefined
  let providerPromise: Promise<typeof provider>

  return createConnector<Provider, Properties, StorageItem>((config) => ({
    id: 'metaKeep',
    name: 'MetaKeep',
    type: metaKeep.type,
    async setup() {
      const provider = await this.getProvider()
      console.log('🦛 | file: metaKeep.ts:36 | provider: ', provider) 
      if (provider)
        provider.on('connect', this.onConnect.bind(this) as Listener)
    },
    async connect({ chainId, isReconnecting } = {}) {
      console.log('🦛 | file: metaKeep.ts:42 | connect run:', !!provider) 
      if (!provider) {
        const { MetaKeep } = await import('metakeep') // Import MetaKeep SDK

        if (!parameters.appId) throw new Error('appId not found')

        const sdk = new MetaKeep({
          environment: 'prod',
          appId: parameters.appId,
          user: parameters.user,
          chainId: 80002, // TODO: might move out from eth
          rpcNodeUrls: {
            80002: 'https://polygon-amoy-bor-rpc.publicnode.com',
          }
        })

        /* Use MetaKeep web3 provider */
        const web3Provider = await sdk.ethereum;
        // await web3Provider.enable();

        /* Initialize ethers provider */
        provider = new ethers.providers.Web3Provider(web3Provider);
      }
      const signer = provider.getSigner()

      let accounts: readonly Address[] = []
      if (isReconnecting) accounts = await this.getAccounts().catch(() => [])

      try {
        if (!accounts?.length) {
          accounts = [(await signer.getAddress())] as readonly `0x${string}`[] // Using MetaKeep SDK's method
        }

        provider.removeListener(
          'connect',
          this.onConnect.bind(this) as Listener,
        )
        provider.on(
          'accountsChanged',
          this.onAccountsChanged.bind(this) as Listener,
        )
        provider.on('chainChanged', this.onChainChanged as Listener)
        provider.on('disconnect', this.onDisconnect.bind(this) as Listener)

        let currentChainId = (await this.getChainId()) as number
        if (chainId && currentChainId !== chainId) {
          const chain = await this.switchChain!({ chainId }).catch((error) => {
            if (error.code === UserRejectedRequestError.code) throw error
            return { id: currentChainId }
          })
          currentChainId = chain?.id ?? currentChainId
        }

        await config.storage?.removeItem('metaKeep.disconnected')

        return { accounts, chainId: currentChainId }
      } catch (err) {
        const error = err as RpcError
        if (error.code === UserRejectedRequestError.code)
          throw new UserRejectedRequestError(error)
        if (error.code === ResourceUnavailableRpcError.code)
          throw new ResourceUnavailableRpcError(error)
        throw error
      }
    },
    async disconnect() {
      const provider = await this.getProvider()

      provider.removeListener(
        'accountsChanged',
        this.onAccountsChanged.bind(this),
      )
      provider.removeListener('chainChanged', this.onChainChanged)
      provider.removeListener('disconnect', this.onDisconnect.bind(this))
      provider.on('connect', this.onConnect.bind(this) as Listener)

      // Add shim signaling connector is disconnected
      await config.storage?.setItem('metaKeep.disconnected', true)
    },
    async getAccounts() {
      const provider = await this.getProvider()
      const signer = provider.getSigner()
      const accounts = [(await signer.getAddress())] as string[]
      return accounts.map((x) => getAddress(x))
    },
    async getChainId() {
      const provider = await this.getProvider()
      const signer = provider.getSigner()
      const chainId = await signer.getChainId()
      return Number(chainId)
    },
    async getProvider() {
      async function initProvider() {
        // not sure we need this
        // return true;
      }

      if (!provider) {
        if (!providerPromise) providerPromise = initProvider()
        provider = await providerPromise
      }
      return provider!
    },
    async isAuthorized() {
      try {
        const isDisconnected = await config.storage?.getItem('metaKeep.disconnected')
        if (isDisconnected) return false

        const accounts = await this.getAccounts()
        return !!accounts.length
      } catch {
        return false
      }
    },
    async switchChain({ chainId }) {
      const provider = await this.getProvider()

      const chain = config.chains.find((x) => x.id === chainId)
      if (!chain) throw new SwitchChainError(new ChainNotConfiguredError())

      try {
        await Promise.all([
          provider.send('wallet_switchEthereumChain',
            [{ chainId: numberToHex(chainId) }],
          ),
          new Promise<void>((resolve) =>
            config.emitter.once('change', ({ chainId: currentChainId }) => {
              if (currentChainId === chainId) resolve()
            }),
          ),
        ])
        return chain
      } catch (err) {
        const error = err as RpcError

        if (error.code === UserRejectedRequestError.code)
          throw new UserRejectedRequestError(error)
        throw new SwitchChainError(error)
      }
    },
    async onAccountsChanged(accounts) {
      if (accounts.length === 0) this.onDisconnect()
      else if (config.emitter.listenerCount('connect')) {
        const chainId = (await this.getChainId()).toString()
        this.onConnect({ chainId })
        await config.storage?.removeItem('metaKeep.disconnected')
      } else {
        config.emitter.emit('change', {
          accounts: accounts.map((x) => getAddress(x)),
        })
      }
    },
    onChainChanged(chain) {
      const chainId = Number(chain)
      config.emitter.emit('change', { chainId })
    },
    async onConnect(connectInfo) {
      const accounts = await this.getAccounts()
      if (accounts.length === 0) return

      const chainId = Number(connectInfo.chainId)
      config.emitter.emit('connect', { accounts, chainId })

      const provider = await this.getProvider()
      if (provider) {
        provider.removeListener('connect', this.onConnect.bind(this))
        provider.on('accountsChanged', this.onAccountsChanged.bind(this))
        provider.on('chainChanged', this.onChainChanged)
        provider.on('disconnect', this.onDisconnect.bind(this))
      }
    },
    async onDisconnect(error) {
      const provider = await this.getProvider()

      if (error && (error as RpcError<1013>).code === 1013) {
        if (provider && !!(await this.getAccounts()).length) return
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('MetaKeep_cached_address')
        localStorage.removeItem('MetaKeep_cached_chainId')
      }

      config.emitter.emit('disconnect')

      provider.removeListener('accountsChanged', this.onAccountsChanged.bind(this))
      provider.removeListener('chainChanged', this.onChainChanged)
      provider.removeListener('disconnect', this.onDisconnect.bind(this))
      provider.on('connect', this.onConnect.bind(this))
    },
  }))
}
