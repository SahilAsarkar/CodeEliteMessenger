import { useEffect, useState, useRef } from "react"
import { supabase } from "./supabase"

function App() {
  const [session, setSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [username, setUsername] = useState("")
  const [loginUsername, setLoginUsername] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const messagesEndRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) fetchMessages()
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session) fetchMessages()
        else setMessages([])
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel("chat-room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => fetchMessages()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("messages")
      .select(`
        id,
        content,
        created_at,
        user_id,
        profiles ( username )
      `)
      .order("created_at", { ascending: true })

    setMessages(data || [])
  }

  const getInitials = (name) => {
    if (!name) return "?"
    return name.charAt(0).toUpperCase()
  }

  const isStrongPassword = (password) => {
    const strongRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/
    return strongRegex.test(password)
  }

  const handleSignUp = async (email, password) => {
    setErrorMessage("")

    if (!username.trim()) {
      return setErrorMessage("Username is required.")
    }

    if (!email || !password) {
      return setErrorMessage("Please fill all fields.")
    }

    if (!isStrongPassword(password)) {
      return setErrorMessage(
        "Password must be at least 8 characters long and include uppercase, lowercase and a number."
      )
    }

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      return setErrorMessage(error.message)
    }

    await supabase.from("profiles").insert({
      id: data.user.id,
      username: username.trim()
    })

    setErrorMessage("Account created successfully! You can now login.")
  }

  const handleLogin = async (email, password) => {
    setErrorMessage("")

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return setErrorMessage("Invalid email or password.")
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", data.user.id)
      .single()

    if (
      !profile ||
      profile.username.trim().toLowerCase() !==
        loginUsername.trim().toLowerCase()
    ) {
      setErrorMessage("Username does not match this account.")
      await supabase.auth.signOut()
      return
    }

    setSession(data.session)
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return

    await supabase.from("messages").insert({
      content: newMessage,
      user_id: session.user.id
    })

    setNewMessage("")
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-gray-950 to-black text-white">
        <div className="w-96 p-10 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl">
          <h1 className="text-3xl font-bold text-center mb-8">CodeElite Messenger</h1>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500 text-sm text-red-300">
              {errorMessage}
            </div>
          )}

          <input id="email" placeholder="Email" className="w-full mb-3 p-3 rounded-xl bg-white/10 border border-white/20" />
          <input id="password" type="password" placeholder="Password" className="w-full mb-3 p-3 rounded-xl bg-white/10 border border-white/20" />
          <input
            placeholder="Username"
            value={loginUsername}
            onChange={e => setLoginUsername(e.target.value)}
            className="w-full mb-4 p-3 rounded-xl bg-white/10 border border-white/20"
          />

          <button
            onClick={() =>
              handleLogin(
                document.getElementById("email").value,
                document.getElementById("password").value
              )
            }
            className="w-full py-3 mb-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition"
          >
            Login
          </button>

          <div className="border-t border-white/10 my-6"></div>

          <input id="s_email" placeholder="Email" className="w-full mb-3 p-3 rounded-xl bg-white/10 border border-white/20" />
          <input id="s_password" type="password" placeholder="Password" className="w-full mb-3 p-3 rounded-xl bg-white/10 border border-white/20" />
          <input
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full mb-4 p-3 rounded-xl bg-white/10 border border-white/20"
          />

          <button
            onClick={() =>
              handleSignUp(
                document.getElementById("s_email").value,
                document.getElementById("s_password").value
              )
            }
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition"
          >
            Create Account
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-gray-950 to-black text-white">
      <div className="w-full min-h-screen flex flex-col bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/30">
          <h2 className="text-lg font-semibold">CodeElite Messenger</h2>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              setSession(null)
            }}
            className="px-4 py-1.5 text-sm rounded-xl bg-red-500 hover:bg-red-600 transition"
          >
            Logout
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {messages.map(msg => {
            const isMe = msg.user_id === session.user.id
            const userName = msg.profiles?.username || "Unknown"

            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-md px-5 py-4 rounded-2xl ${
                  isMe
                    ? "bg-indigo-600 rounded-br-none"
                    : "bg-white/10 rounded-bl-none"
                }`}>
                  <div className="text-xs opacity-60 mb-1">
                    {userName} • {new Date(msg.created_at).toLocaleTimeString()}
                  </div>
                  <div className="text-sm">
                    {msg.content}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef}></div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-black/30 flex gap-4">
          <input
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Write a message..."
            className="flex-1 px-5 py-3 rounded-2xl bg-white/10 border border-white/20 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={sendMessage}
            className="px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 transition"
          >
            Send
          </button>
        </div>

      </div>
    </div>
  )
}

export default App