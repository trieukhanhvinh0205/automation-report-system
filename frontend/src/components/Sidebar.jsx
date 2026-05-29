function Sidebar({ onLogout, activeView, onViewChange }) {
  const items = [
    { key: "reports", label: "Reports" },
    { key: "elk", label: "ELK" },
    { key: "templates", label: "Templates" }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand-mark">AR</div>
        <div>
          <h2 className="brand">AutoReport</h2>
          <p className="brand-sub">SOC reporting</p>
        </div>
      </div>
      <nav className="menu">
        {items.map((item) => (
          <button
            className={`menu-item ${activeView === item.key ? "active" : ""}`}
            type="button"
            onClick={() => onViewChange(item.key)}
            key={item.key}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button className="logout-btn" type="button" onClick={onLogout}>
        Logout
      </button>
    </aside>
  );
}

export default Sidebar;
