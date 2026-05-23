import { useState } from "react";

export default function DriverSetup() {
  const [activeTab, setActiveTab] = useState<"zadig" | "usbdk" | "unix">("zadig");

  return (
    <div className="bg-neutral-800/30 rounded-lg p-5 border border-neutral-800/50 shadow-lg">
      <h3 className="text-sm font-bold text-neutral-200 mb-3 uppercase tracking-wider flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        USB Driver Setup Guide
      </h3>
      
      <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
        Focusrite's default Windows driver locks the device interface. To control the physical hardware mixer, phantom power, and routing in RedMatrix, you need to configure a user-space driver.
      </p>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 mb-4">
        <button
          onClick={() => setActiveTab("zadig")}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px ${
            activeTab === "zadig"
              ? "border-red-500 text-red-400"
              : "border-transparent text-neutral-400 hover:text-neutral-300"
          }`}
        >
          Zadig / WinUSB (Recommended)
        </button>
        <button
          onClick={() => setActiveTab("usbdk")}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px ${
            activeTab === "usbdk"
              ? "border-red-500 text-red-400"
              : "border-transparent text-neutral-400 hover:text-neutral-300"
          }`}
        >
          UsbDk (Alternative)
        </button>
        <button
          onClick={() => setActiveTab("unix")}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-px ${
            activeTab === "unix"
              ? "border-red-500 text-red-400"
              : "border-transparent text-neutral-400 hover:text-neutral-300"
          }`}
        >
          macOS / Linux
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[220px]">
        {activeTab === "zadig" && (
          <div className="space-y-3 animate-fade-in">
            <p className="text-xs text-neutral-300">
              WinUSB allows RedMatrix to communicate with the proprietary control interface without losing your normal audio capabilities.
            </p>
            <ol className="list-decimal pl-5 text-xs text-neutral-400 space-y-2">
              <li>
                Download <a href="https://zadig.akeo.ie" target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline inline-flex items-center gap-0.5">
                  Zadig
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>.
              </li>
              <li>Connect your Scarlett / Clarett device via USB.</li>
              <li>Launch Zadig, then click <strong>Options</strong> and select <strong>List All Devices</strong>.</li>
              <li>
                In the dropdown list, find your device's proprietary interface:
                <div className="bg-neutral-900/60 p-2 rounded mt-1 font-mono text-[10px] text-neutral-300 border border-neutral-800">
                  Select <span className="text-red-400">Scarlett Solo / 2i2 / 4i4 / 8i6 / 18i8 / 18i20 (Interface 3 or 4)</span><br />
                  Class code must be <span className="text-amber-500">0xFF</span> (Vendor Specific).
                </div>
              </li>
              <li>
                Ensure the target driver on the right side of the green arrow is set to <strong>WinUSB</strong>.
              </li>
              <li>
                Click <strong>Replace Driver</strong> (or <strong>Install Driver</strong>) and wait for the success notification.
              </li>
            </ol>
            <div className="bg-green-950/20 border border-green-800/40 rounded p-2.5 mt-2">
              <span className="text-[10px] text-green-400 font-bold block mb-0.5">✔ PLAYBACK REMAINS ACTIVE</span>
              <p className="text-[10px] text-green-500/80 leading-relaxed">
                Replacing the driver only on the vendor interface (Interface 3/4) leaves the class-compliant audio playback interfaces (Interface 0/1/2) untouched. Your audio will continue to work perfectly.
              </p>
            </div>
          </div>
        )}

        {activeTab === "usbdk" && (
          <div className="space-y-3 animate-fade-in">
            <p className="text-xs text-neutral-300">
              UsbDk (USB Development Kit) is a driver framework developed by RedHat that allows exclusive user-space access to USB devices dynamically.
            </p>
            <ol className="list-decimal pl-5 text-xs text-neutral-400 space-y-2">
              <li>
                Download the latest installer from the official <a href="https://github.com/daynix/UsbDk/releases" target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline inline-flex items-center gap-0.5">
                  UsbDk Releases
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>.
              </li>
              <li>Run the downloaded <code>.msi</code> installer package.</li>
              <li>Follow the installation wizard and complete the setup.</li>
              <li>Restart your computer to ensure the driver service starts correctly.</li>
            </ol>
            <div className="bg-blue-950/20 border border-blue-800/40 rounded p-2.5 mt-2">
              <span className="text-[10px] text-blue-400 font-bold block mb-0.5">ℹ WHEN TO USE USBDK</span>
              <p className="text-[10px] text-blue-500/80 leading-relaxed">
                Use UsbDk if you prefer not to touch Zadig driver associations or if you want RedMatrix to automatically claim/release the device without permanent changes. Note that UsbDk can occasionally conflict with specific DAW software.
              </p>
            </div>
          </div>
        )}

        {activeTab === "unix" && (
          <div className="space-y-4 animate-fade-in">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-neutral-300 block"> macOS</span>
              <p className="text-xs text-neutral-400 leading-relaxed">
                No drivers are needed! macOS permits applications to open and claim proprietary control interfaces directly through the native USB subsystem.
              </p>
            </div>
            
            <div className="h-px bg-neutral-800" />
            
            <div className="space-y-2">
              <span className="text-xs font-bold text-neutral-300 block">🐧 Linux</span>
              <p className="text-xs text-neutral-400 leading-relaxed">
                To run RedMatrix without superuser privileges, install the following <code>udev</code> rules file to grant user-space read/write access:
              </p>
              <div className="space-y-1">
                <span className="text-[9px] text-neutral-500 font-mono block">Create file /etc/udev/rules.d/50-focusrite.rules:</span>
                <pre className="bg-neutral-900 text-neutral-300 p-2.5 rounded font-mono text-[10px] border border-neutral-800 overflow-x-auto selection:bg-red-800 selection:text-white">
                  {'SUBSYSTEMS=="usb", ATTRS{idVendor}=="1235", MODE="0666"'}
                </pre>
              </div>
              <p className="text-[10px] text-neutral-500 font-medium leading-relaxed">
                After saving the file, reload udev rules with: <code className="bg-neutral-900 px-1 py-0.5 rounded text-neutral-400 font-mono">sudo udevadm control --reload-rules && sudo udevadm trigger</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
