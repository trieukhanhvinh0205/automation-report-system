import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Field, Input, Spinner, Text } from "@fluentui/react-components";
import { useAuth } from "../context/AuthContext";
import { loginRequest } from "../services/authService";
import { AppMessage } from "../components/ui/Feedback";

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await loginRequest({ username, password });
      login(result.token);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <Card className="login-card">
        <div>
          <h1>Automation Report</h1>
          <Text color="secondary">Sign in to open your dashboard.</Text>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <Field label="Username" required>
            <Input value={username} onChange={(_, data) => setUsername(data.value)} required />
          </Field>
          <Field label="Password" required>
            <Input type="password" value={password} onChange={(_, data) => setPassword(data.value)} required />
          </Field>
          <AppMessage intent="error">{error}</AppMessage>
          <Button appearance="primary" type="submit" disabled={loading}>
            {loading ? <Spinner size="tiny" label="Logging in..." /> : "Login"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

export default LoginPage;
