import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { AgentDrawer } from './components/AgentDrawer';
import { Overlay } from './components/Overlay';
import { api } from './lib/api';
import type { Agent } from './components/types';

function App() {
  const [fleet, setFleet] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [connected, setConnected] = useState(false);

  const fetchFleet = useCallback(async () => {
    try {
      const response = await api.get('/api/federation/fleet');
      if (response.data) {
        setFleet(response.data);
        setConnected(true);
      }
    } catch (err) {
      console.error('Failed to fetch fleet:', err);
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchFleet();
    const interval = setInterval(fetchFleet, 10000);
    return () => clearInterval(interval);
  }, [fetchFleet]);

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const handleCloseDrawer = () => {
    setSelectedAgent(null);
  };

  return (
    <div className="app">
      <Header connected={connected} />
      <Sidebar fleet={fleet} selectedAgent={selectedAgent} onSelect={handleSelectAgent} />
      <MainContent selectedAgent={selectedAgent} />
      {selectedAgent && (
        <>
          <Overlay onClick={handleCloseDrawer} />
          <AgentDrawer agent={selectedAgent} onClose={handleCloseDrawer} />
        </>
      )}
    </div>
  );
}

export default App;