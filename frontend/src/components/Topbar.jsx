import { Text, Title1 } from "@fluentui/react-components";

function Topbar({ title, subtitle }) {
  return (
    <header className="topbar">
      <Title1>{title}</Title1>
      <Text color="secondary">{subtitle}</Text>
    </header>
  );
}

export default Topbar;
