import { Button } from "@fluentui/react-components";
import { DocumentTextRegular, HomeRegular, SignOutRegular, TableRegular } from "@fluentui/react-icons";

function Sidebar({ onLogout, activeView, onViewChange }) {
  const items = [
    { key: "reports", label: "Reports", icon: <HomeRegular /> },
    { key: "elk", label: "ELK", icon: <TableRegular /> },
    { key: "templates", label: "Templates", icon: <DocumentTextRegular /> }
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
          <Button
            appearance={activeView === item.key ? "primary" : "subtle"}
            icon={item.icon}
            className={`menu-item ${activeView === item.key ? "active" : ""}`}
            type="button"
            onClick={() => onViewChange(item.key)}
            key={item.key}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <Button className="logout-btn" icon={<SignOutRegular />} type="button" onClick={onLogout}>
        Logout
      </Button>
    </aside>
  );
}

export default Sidebar;
