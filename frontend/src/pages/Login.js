import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Wallet, Loader2, ShieldCheck, TrendingUp, CalendarClock } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white dark:bg-slate-950">
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <span className="font-heading text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              MensaliPay
            </span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Bem-vindo de volta
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-500 dark:text-slate-400">
            Acesse sua conta para gerenciar suas mensalidades.
          </p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                data-testid="login-email-input"
                type="email"
                required
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="login-password-input"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  data-testid="login-toggle-password"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p data-testid="login-error-message" className="text-sm font-medium text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}
            <Button
              data-testid="login-submit-button"
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            Ainda não tem conta?{" "}
            <Link to="/register" data-testid="go-to-register-link" className="font-semibold text-emerald-600 hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </div>
      <div className="hidden lg:block relative">
        <img
          src="https://images.pexels.com/photos/37685036/pexels-photo-37685036.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
          alt="Gestão financeira"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative z-10 flex h-full flex-col justify-end p-12">
          <h2 className="font-heading text-3xl font-extrabold text-white leading-tight max-w-md">
            Controle total das suas mensalidades em um só lugar.
          </h2>
          <div className="mt-8 space-y-4">
            {[
              { icon: CalendarClock, text: "Vencimentos organizados por dia e mês" },
              { icon: ShieldCheck, text: "Confirme pagamentos com um clique" },
              { icon: TrendingUp, text: "Relatórios financeiros em tempo real" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-slate-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 backdrop-blur">
                  <Icon className="h-4 w-4 text-emerald-400" />
                </div>
                <span className="text-sm font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
