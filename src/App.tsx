import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Header from "./components/Header";
import Footer from "./components/Footer";
import TabBar, { type TabName } from "./components/TabBar";
import { DeviceProvider } from "./hooks/useDevice";
import Overview from "./components/tabs/Overview";
import Mixer from "./components/tabs/Mixer";
import Input from "./components/tabs/Input";
import Output from "./components/tabs/Output";
import Settings from "./components/tabs/Settings";
import About from "./components/About";
import PairingModal from "./components/PairingModal";
import { ToastContainer } from "./components/Toast";

const TAB_COMPONENTS: Record<TabName, React.FC> = {
  Overview,
  Mixer,
  Input,
  Output,
};

interface PairingRequestPayload {
  client_name: string;
  client_fingerprint: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabName>("Overview");
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pairingRequest, setPairingRequest] = useState<{ name: string; fingerprint: string } | null>(null);
  const ActiveComponent = TAB_COMPONENTS[activeTab];

  const handleDeviceSwitch = () => {
    // Force re-mount of DeviceProvider to re-fetch state
    setRefreshKey((k) => k + 1);
  };

  // Listen for pairing requests from the Rust backend
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      const unlisten = await listen<PairingRequestPayload>("pairing_requested", (event) => {
        if (!cancelled) {
          setPairingRequest({
            name: event.payload.client_name,
            fingerprint: event.payload.client_fingerprint,
          });
        }
      });
      return unlisten;
    };

    const unlistenPromise = setup();
    return () => {
      cancelled = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handlePairingApprove = () => {
    if (pairingRequest) {
      invoke("approve_pairing", { fingerprint: pairingRequest.fingerprint, approved: true });
      setPairingRequest(null);
    }
  };

  const handlePairingDeny = () => {
    if (pairingRequest) {
      invoke("approve_pairing", { fingerprint: pairingRequest.fingerprint, approved: false });
      setPairingRequest(null);
    }
  };

  return (
    <DeviceProvider key={refreshKey}>
      <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col">
        <Header
          onSettingsClick={() => setShowSettings(!showSettings)}
          onAboutClick={() => setShowAbout(true)}
          onDeviceSwitch={handleDeviceSwitch}
        />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 relative">
          {showSettings ? (
            <Settings />
          ) : (
            <ActiveComponent />
          )}
        </main>
        <Footer />

        {showAbout && <About onClose={() => setShowAbout(false)} />}
        {pairingRequest && (
          <PairingModal
            clientName={pairingRequest.name}
            clientFingerprint={pairingRequest.fingerprint}
            onApprove={handlePairingApprove}
            onDeny={handlePairingDeny}
          />
        )}
        <ToastContainer />
      </div>
    </DeviceProvider>
  );
}

export default App;
