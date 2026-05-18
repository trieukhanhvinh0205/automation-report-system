function Sidebar({ onLogout, activeView, onViewChange }) {
  return (
    <aside className="sidebar">
      <div>
        <h2 className="brand">AutoReport</h2>
        <p className="brand-sub">Automation Report Hub</p>
      </div>
      <nav className="menu">
        <button
          className={`menu-item ${activeView === "reports" ? "active" : ""}`}
          type="button"
          onClick={() => onViewChange("reports")}
        >
          Reports
        </button>
        <button
          className={`menu-item ${activeView === "elk" ? "active" : ""}`}
          type="button"
          onClick={() => onViewChange("elk")}
        >
          ELK Monitoring
        </button>
      </nav>
      <button className="ghost danger" type="button" onClick={onLogout}>
        Logout
      </button>
    </aside>
  );
}

export default Sidebar;
