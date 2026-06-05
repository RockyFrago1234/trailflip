import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Load the user's profile row (display name etc.) whenever they change
  useEffect(() => {
    let active = true
    async function loadProfile() {
      if (!user) {
        setProfile(null)
        return
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (active) setProfile(data ?? null)
    }
    loadProfile()
    return () => {
      active = false
    }
  }, [user])

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'You'

  async function signUp(email, password, name) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name || email.split('@')[0] } },
    })
    return error
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const value = { user, profile, ready, displayName, signUp, signIn, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
