function Sidebar({ onLogout }) {
  return (
    <aside className="sidebar">
      <div>
        <h2 className="brand">AutoReport</h2>
        <p className="brand-sub">Automation Report Hub</p>
      </div>
      <nav className="menu">
        <button className="menu-item active" type="button">Dashboard</button>
      </nav>
      <button className="ghost danger" type="button" onClick={onLogout}>
        Logout
      </button>
    </aside>
  );
}

export default Sidebar;
