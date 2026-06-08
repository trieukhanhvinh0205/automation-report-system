import { MessageBar, MessageBarBody, MessageBarTitle, Spinner } from "@fluentui/react-components";

export function AppMessage({ intent = "info", title, children }) {
  if (!children && !title) return null;

  return (
    <MessageBar intent={intent}>
      <MessageBarBody>
        {title && <MessageBarTitle>{title}</MessageBarTitle>}
        {children}
      </MessageBarBody>
    </MessageBar>
  );
}

export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="fluent-loading">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ title = "No data", description }) {
  return (
    <div className="fluent-empty">
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}
