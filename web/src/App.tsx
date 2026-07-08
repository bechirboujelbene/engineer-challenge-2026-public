import { useState } from 'react'
import Login from './components/Login'
import Inbox from './components/Inbox'
import { User } from './types'

export default function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('token') || '')
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  })

  const onLogin = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const onLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken('')
    setUser(null)
  }

  if (!token || !user) {
    return <Login onLogin={onLogin} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Pulse</h1>
        <div className="topbar-right">
          <span className="topbar-user">{user.name}</span>
          <button className="link-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <Inbox token={token} />
    </div>
  )
}
