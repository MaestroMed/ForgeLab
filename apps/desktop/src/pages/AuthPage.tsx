import { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { useToastStore } from '@/store';

export default function AuthPage({ onAuth }: { onAuth: (token: string, user: any) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToastStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await api.login(email, password)
        : await api.register(email, password, username);
      const token = (res as any)?.data?.access_token ?? (res as any)?.access_token;
      const user = (res as any)?.data?.user ?? (res as any)?.user;
      if (!token) throw new Error('No token returned');
      onAuth(token, user);
      addToast({
        type: 'success',
        title: mode === 'login' ? 'Connecté' : 'Compte créé',
        message: `Bienvenue ${user?.username ?? user?.email}`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: mode === 'login' ? 'Connexion échouée' : 'Inscription échouée',
        message: err?.message ?? 'Vérifie tes identifiants.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[var(--bg-primary)] to-black">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-viral-medium to-viral-high mb-4">
            <Zap className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-3xl font-bold">FORGE LAB</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">Studio de clips viraux</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'login' ? 'bg-viral-medium/20 text-viral-medium' : 'text-[var(--text-muted)] hover:bg-white/5'
                }`}
              >
                <LogIn className="w-4 h-4 inline mr-2" />
                Connexion
              </button>
              <button
                onClick={() => setMode('register')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'register' ? 'bg-viral-medium/20 text-viral-medium' : 'text-[var(--text-muted)] hover:bg-white/5'
                }`}
              >
                <UserPlus className="w-4 h-4 inline mr-2" />
                Inscription
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-viral-medium"
                  placeholder="vous@exemple.com"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Nom d'utilisateur (optionnel)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-viral-medium"
                    placeholder="forger_prenom"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-viral-medium"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? '...' : (mode === 'login' ? 'Se connecter' : 'Créer un compte')}
              </Button>

              {mode === 'register' && (
                <p className="text-xs text-[var(--text-muted)] text-center">
                  Plan gratuit: 5 clips/mois · Upgrade Pro pour illimité
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-[var(--text-muted)] text-center mt-4">
          Mode local? Définissez FORGE_SAAS_MODE=false pour contourner l'auth.
        </p>
      </motion.div>
    </div>
  );
}
