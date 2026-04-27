import { createClient } from '@supabase/supabase-js'
import { recordFailure, recordSuccess } from './healthMonitor.js'

// Wrap fetch so every Supabase API call lands in the health
// monitor. We treat any 5xx (PostgREST PGRST002/PGRST003 typically
// surface as 503), 408 (timeout) and 429 (rate-limit) plus thrown
// network errors as failures. 4xx (RLS denials, validation) are
// app-level and counted as success — the backend was reachable.
//
// The custom fetch is a thin pass-through so we don't change the
// supabase-js retry behaviour or break streaming responses; we
// only observe.
function monitoredFetch(input, init){
  var url = typeof input === 'string' ? input : (input && input.url) || ''
  return fetch(input, init).then(
    function(res){
      var status = res && res.status
      if(status >= 500 || status === 408 || status === 429){
        recordFailure({ url: url, status: status, kind: 'http' })
      } else {
        recordSuccess(url)
      }
      return res
    },
    function(err){
      // Network throw — DNS, offline, abort. Treat as down-signal.
      recordFailure({
        url: url,
        status: 0,
        kind: 'network',
        message: (err && err.message) || 'network error',
      })
      throw err
    }
  )
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { global: { fetch: monitoredFetch } }
)
