import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { FlockAgent } from '../types/flockAgent';

interface FlockAgentsContextValue {
  agents: FlockAgent[];
  /** Re-scan the agents directory. Cheap; safe to call on user-triggered refresh. */
  refresh: () => Promise<void>;
  loading: boolean;
}

const FlockAgentsContext = createContext<FlockAgentsContextValue | null>(null);

export function FlockAgentsProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<FlockAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const fetched = await window.electron.getFlockAgents();
      setAgents(fetched ?? []);
    } catch (err) {
      console.error('Failed to load flock agents:', err);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <FlockAgentsContext.Provider value={{ agents, refresh, loading }}>
      {children}
    </FlockAgentsContext.Provider>
  );
}

export function useFlockAgents(): FlockAgentsContextValue {
  const ctx = useContext(FlockAgentsContext);
  if (!ctx) {
    throw new Error('useFlockAgents must be used within FlockAgentsProvider');
  }
  return ctx;
}
