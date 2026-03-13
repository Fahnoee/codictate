/* eslint-disable @typescript-eslint/no-empty-object-type */
import { RPCSchema } from 'electrobun'

export type WebviewRPCType = {
  // functions that execute in the main process
  bun: RPCSchema<{
    requests: {
      startMicSession: { params: {}; response: boolean }
    }
    messages: {
      logBun: { msg: string }
    }
  }>
  // functions that execute in the browser context
  webview: RPCSchema<{
    requests: {}
    messages: {}
  }>
}
