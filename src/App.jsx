import { useEffect, useState, useRef } from "react"
import { supabase } from "./supabase"

function App() {
  const [session, setSession] = useState(null)
  const [rooms, setRooms] = useState([])
  const [currentRoom, setCurrentRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [privateEmail, setPrivateEmail] = useState("")
  const [privateUser, setPrivateUser] = useState(null)
  const [roomNames, setRoomNames] = useState({})
  const messagesEndRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session)
        initialize(data.session.user.id)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session) initialize(session.user.id)
        else {
          setRooms([])
          setCurrentRoom(null)
          setMessages([])
        }
      }
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!currentRoom) return

    loadMessages(currentRoom.id)

    const channel = supabase
      .channel(`room-${currentRoom.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${currentRoom.id}`
        },
        async (payload) => {
          const { data } = await supabase
            .from("messages")
            .select("id,content,created_at,user_id,profiles(username)")
            .eq("id", payload.new.id)
            .single()

          setMessages(prev => [...prev, data])
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [currentRoom])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const initialize = async (userId) => {
    await ensureGlobalRoom(userId)
    await loadRooms(userId)
  }

  const ensureGlobalRoom = async (userId) => {
    let { data } = await supabase
      .from("chat_rooms")
      .select("*")
      .eq("is_private", false)
      .maybeSingle()

    if (!data) {
      const { data: newRoom } = await supabase
        .from("chat_rooms")
        .insert({ is_private: false })
        .select()
        .single()

      await supabase.from("chat_members").insert({
        room_id: newRoom.id,
        user_id: userId
      })
    } else {
      const { data: member } = await supabase
        .from("chat_members")
        .select("*")
        .eq("room_id", data.id)
        .eq("user_id", userId)
        .maybeSingle()

      if (!member) {
        await supabase.from("chat_members").insert({
          room_id: data.id,
          user_id: userId
        })
      }
    }
  }

  const loadRooms = async (userId) => {
    const { data } = await supabase
      .from("chat_members")
      .select("room_id, chat_rooms(id,is_private)")
      .eq("user_id", userId)

    if (!data) return

    const formatted = data.map(r => r.chat_rooms)
    setRooms(formatted)

    for (let room of formatted) {
      if (room.is_private) {
        await loadPrivateRoomName(room.id, userId)
      } else {
        setRoomNames(prev => ({ ...prev, [room.id]: "Global Room" }))
      }
    }

    if (formatted.length > 0) {
      setCurrentRoom(formatted[0])
    }
  }

  const loadPrivateRoomName = async (roomId, userId) => {
    const { data: members } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("room_id", roomId)

    if (!members) return

    const other = members.find(m => m.user_id !== userId)
    if (!other) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", other.user_id)
      .single()

    if (profile) {
      setRoomNames(prev => ({
        ...prev,
        [roomId]: profile.username
      }))
    }
  }

  const loadMessages = async (roomId) => {
    const { data } = await supabase
      .from("messages")
      .select("id,content,created_at,user_id,profiles(username)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })

    setMessages(data || [])
  }

  const handleSignup = async () => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return alert(error.message)

    await supabase.from("profiles").insert({
      id: data.user.id,
      username,
      email
    })

    alert("Account created. Login now.")
    setEmail("")
    setPassword("")
    setUsername("")
  }

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return alert(error.message)

    setSession(data.session)
    initialize(data.user.id)
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return

    await supabase.from("messages").insert({
      content: newMessage,
      user_id: session.user.id,
      room_id: currentRoom.id
    })

    setNewMessage("")
  }

  const searchUser = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id,username,email")
      .eq("email", privateEmail)
      .maybeSingle()

    if (!data) return alert("User not found")
    if (data.id === session.user.id) return alert("Cannot chat with yourself")

    setPrivateUser(data)
  }

  const createPrivateRoom = async () => {
    if (!privateUser) return

    const { data: room } = await supabase
      .from("chat_rooms")
      .insert({ is_private: true })
      .select()
      .single()

    await supabase.from("chat_members").insert([
      { room_id: room.id, user_id: session.user.id },
      { room_id: room.id, user_id: privateUser.id }
    ])

    await loadRooms(session.user.id)
    setPrivateEmail("")
    setPrivateUser(null)
  }

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : "?"

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a] text-white">
        <div className="w-96 p-8 bg-white/5 rounded-2xl backdrop-blur-lg shadow-xl space-y-4">
          <h2 className="text-xl font-semibold text-center">Login / Signup</h2>

          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 rounded-lg bg-white/10 outline-none" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded-lg bg-white/10 outline-none" />
          <input placeholder="Username (for signup)" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 rounded-lg bg-white/10 outline-none" />

          <button onClick={handleLogin} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg">Login</button>
          <button onClick={handleSignup} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg">Signup</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-[#0f172a] text-white">

      <div className="w-80 bg-[#111827] border-r border-white/10 flex flex-col">

        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-semibold">Chats</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {rooms.map(room => (
            <div
              key={room.id}
              onClick={() => setCurrentRoom(room)}
              className={`p-4 rounded-xl cursor-pointer transition-all
                ${currentRoom?.id === room.id
                  ? "bg-indigo-600"
                  : "bg-white/5 hover:bg-white/10"
                }`}
            >
              {roomNames[room.id]}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/10 space-y-3">
          <h3 className="text-sm text-gray-400">Start Private Chat</h3>

          <input
            placeholder="User email"
            value={privateEmail}
            onChange={e => setPrivateEmail(e.target.value)}
            className="w-full p-3 rounded-lg bg-white/5 outline-none"
          />

          <button
            onClick={searchUser}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg"
          >
            Search
          </button>

          {privateUser && (
            <div className="p-3 bg-white/5 rounded-lg flex justify-between items-center">
              <span>{privateUser.username}</span>
              <button
                onClick={createPrivateRoom}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-md text-sm"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">

        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
          <span className="text-lg font-semibold">{roomNames[currentRoom?.id]}</span>
          <button onClick={logout} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg">Logout</button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {messages.map(msg => {
            const isMe = msg.user_id === session.user.id
            const userName = msg.profiles?.username || "Unknown"

            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-md px-5 py-3 rounded-2xl shadow-md
                  ${isMe
                    ? "bg-indigo-600 rounded-br-sm"
                    : "bg-white/10 rounded-bl-sm"
                  }`}
                >
                  <div className="text-xs opacity-60 mb-1">{userName}</div>
                  <div className="text-sm">{msg.content}</div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef}></div>
        </div>

        <div className="p-6 border-t border-white/10">
          <div className="flex gap-4">
            <input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Write a message..."
              className="flex-1 px-5 py-3 rounded-full bg-white/5 outline-none"
            />
            <button
              onClick={sendMessage}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full"
            >
              Send
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

export default App