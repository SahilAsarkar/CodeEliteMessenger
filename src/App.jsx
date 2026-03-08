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
      return
    }

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
      loadMessages(formatted[0].id)
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
      .maybeSingle()

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
    setSession(null)
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return

    await supabase.from("messages").insert({
      content: newMessage,
      user_id: session.user.id,
      room_id: currentRoom.id
    })

    setNewMessage("")
    loadMessages(currentRoom.id)
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

    const { data: existing } = await supabase
      .from("chat_members")
      .select("room_id")
      .eq("user_id", session.user.id)

    for (let r of existing) {
      const { data: members } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("room_id", r.room_id)

      if (
        members.length === 2 &&
        members.some(m => m.user_id === privateUser.id)
      ) {
        alert("Private chat already exists")
        return
      }
    }

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
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="w-96 p-8 bg-white/10 rounded-xl space-y-4">
          <h2 className="text-xl font-bold text-center">Login / Signup</h2>

          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2 rounded bg-white/10" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2 rounded bg-white/10" />
          <input placeholder="Username (for signup)" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-2 rounded bg-white/10" />

          <button onClick={handleLogin} className="w-full py-2 bg-indigo-600 rounded">Login</button>
          <button onClick={handleSignup} className="w-full py-2 bg-emerald-600 rounded">Signup</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-slate-900 text-white">

      <div className="w-72 border-r border-white/10 p-4 space-y-4">
        <h2 className="font-semibold text-lg">Chats</h2>

        {rooms.map(room => (
          <div
            key={room.id}
            onClick={() => {
              setCurrentRoom(room)
              loadMessages(room.id)
            }}
            className="p-3 bg-white/10 rounded cursor-pointer hover:bg-white/20"
          >
            {roomNames[room.id] || "Loading..."}
          </div>
        ))}

        <div className="pt-6 border-t border-white/10">
          <h3 className="text-sm mb-2">Start Private Chat</h3>

          <input
            placeholder="User email"
            value={privateEmail}
            onChange={e => setPrivateEmail(e.target.value)}
            className="w-full p-2 rounded bg-white/10 mb-2"
          />

          <button onClick={searchUser} className="w-full py-2 bg-indigo-600 rounded mb-2">
            Search
          </button>

          {privateUser && (
            <div className="p-2 bg-white/10 rounded flex justify-between">
              <span>{privateUser.username}</span>
              <button onClick={createPrivateRoom} className="px-2 bg-green-600 rounded">
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex justify-between p-4 border-b border-white/10">
          <span>{roomNames[currentRoom?.id]}</span>
          <button onClick={logout} className="px-4 py-2 bg-red-600 rounded">Logout</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map(msg => {
            const isMe = msg.user_id === session.user.id
            const userName = msg.profiles?.username || "Unknown"

            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`px-4 py-3 rounded-xl max-w-md ${isMe ? "bg-indigo-600" : "bg-white/10"}`}>
                  <div className="flex items-center gap-2 text-xs opacity-70 mb-1">
                    <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                      {getInitial(userName)}
                    </div>
                    {userName}
                  </div>
                  <div>{msg.content}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-4 border-t border-white/10 flex gap-2">
          <input value={newMessage} onChange={e => setNewMessage(e.target.value)} className="flex-1 p-3 rounded bg-white/10" placeholder="Write message..." />
          <button onClick={sendMessage} className="px-6 bg-indigo-600 rounded">Send</button>
        </div>
      </div>
    </div>
  )
}

export default App