import { redirect } from "next/navigation";
import { Bell, ChevronDown, Compass, Hash, Home, MessageSquareText, Mic, Paperclip, Phone, Plus, Search, Settings, Smile, Sparkles, Users, Video } from "lucide-react";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const sidebarItems = [
  { icon: Home, label: "Home", active: true },
  { icon: MessageSquareText, label: "Messages" },
  { icon: Users, label: "Friends" },
  { icon: Compass, label: "Discover" },
  { icon: Bell, label: "Alerts" },
  { icon: Settings, label: "Settings" },
];

const servers = [
  { name: "Cord", active: true, glow: "default" },
  { name: "Inspire", active: false, glow: "soft" },
  { name: "Game Night", active: false, glow: "warm" },
  { name: "Launch Lab", active: false, glow: "cool" },
];

const channels = ["general", "introductions", "design", "voice-lounge"];

const friends = [
  { name: "Ari", status: "Online" },
  { name: "Milo", status: "Idle" },
  { name: "Jules", status: "Do Not Disturb" },
  { name: "Rae", status: "Online" },
  { name: "Noah", status: "Offline" },
];

export default async function AppPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="app-shell">
      <aside className="server-sidebar">
        <div className="brand-badge">C</div>
        {servers.map((server) => (
          <div key={server.name} className={`server-pill ${server.active ? "active" : ""} ${server.glow}`}>
            {server.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
          </div>
        ))}
        <button className="server-add" aria-label="Create server"><Plus size={18} /></button>
      </aside>

      <aside className="channel-sidebar">
        <div className="server-header">
          <span>Cord Community</span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-list">
          {sidebarItems.map(({ icon: Icon, label, active }) => (
            <button key={label} className={active ? "nav-item active" : "nav-item"}>
              <Icon size={14} /> <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="section-title">Channels</div>
        <div className="channel-list">
          {channels.map((channel) => (
            <div key={channel} className={channel === "general" ? "channel-row active" : "channel-row"}>
              <Hash size={12} />
              <span>{channel}</span>
            </div>
          ))}
        </div>

        <div className="profile-card">
          <div className="profile-avatar">{user.username.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{user.displayName ?? user.username}</strong>
            <span>{user.presence}</span>
          </div>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <div className="channel-badge"># general</div>
            <span className="header-muted">Welcome to Cord. Start the conversation.</span>
          </div>
          <div className="header-tools">
            <Search size={15} />
            <Sparkles size={15} />
            <Bell size={15} />
          </div>
        </header>

        <div className="messages-container">
          <div className="message-row">
            <div className="avatar orange">A</div>
            <div className="bubble">
              <div className="bubble-header"><strong>Ari</strong><span>Today at 10:32 AM</span></div>
              <p>Welcome to Cord! Let’s get the new community started.</p>
            </div>
          </div>
          <div className="message-row">
            <div className="avatar green">M</div>
            <div className="bubble">
              <div className="bubble-header"><strong>Milo</strong><span>Today at 10:35 AM</span></div>
              <p>I made a few rough mockups. The dark-first system feels clean and premium.</p>
            </div>
          </div>
          <div className="message-row self">
            <div className="bubble dark">
              <div className="bubble-header"><strong>{user.displayName ?? user.username}</strong><span>Now</span></div>
              <p>Perfect. I’m setting the final flow for channels, presence, and DMs next.</p>
            </div>
          </div>
        </div>

        <div className="composer">
          <button type="button" aria-label="Attach file"><Paperclip size={15} /></button>
          <button type="button" aria-label="Voice call"><Mic size={15} /></button>
          <button type="button" aria-label="Video call"><Video size={15} /></button>
          <input type="text" value="Message #general" readOnly />
          <button type="button" aria-label="Emoji"><Smile size={15} /></button>
          <button type="button" className="send-button"><Phone size={15} /></button>
        </div>
      </section>

      <aside className="member-panel">
        <div className="member-title">People</div>
        {friends.map((friend) => (
          <div className="friend-row" key={friend.name}>
            <span className="friend-dot" />
            <div className="friend-avatar">{friend.name[0]}</div>
            <div>
              <strong>{friend.name}</strong>
              <span>{friend.status}</span>
            </div>
          </div>
        ))}
      </aside>
    </main>
  );
}
