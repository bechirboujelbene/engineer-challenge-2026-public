import { useState, FormEvent } from 'react'
import { login } from '../api'
import { User } from '../types'

export default function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const { token, user } = await login(email, password)
      onLogin(token, user)
    } catch {
      setError('Invalid email or password')
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Pulse</h1>
        <p className="subtitle">Customer feedback inbox</p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  )
}
