import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useToast } from "../../contexts/toast";

type APIProvider = "openai" | "anthropic";

interface SettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ open: externalOpen, onOpenChange }: SettingsDialogProps) {
  const [open, setOpen] = useState(externalOpen || false);
  const [apiProvider, setApiProvider] = useState<APIProvider>("openai");
  const [isLoading, setIsLoading] = useState(false);
  const [availableKeys, setAvailableKeys] = useState<{
    openAI: boolean;
    anthropic: boolean;
  }>({ openAI: false, anthropic: false });
  const { showToast } = useToast();

  // Sync with external open state
  useEffect(() => {
    if (externalOpen !== undefined) {
      setOpen(externalOpen);
    }
  }, [externalOpen]);

  // Handle open state changes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    // Only call onOpenChange when there's actually a change
    if (onOpenChange && newOpen !== externalOpen) {
      onOpenChange(newOpen);
    }
  };

  // Load current config on dialog open
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      interface Config {
        apiProvider?: APIProvider;
        openAIKey?: string;
        anthropicKey?: string;
      }

      window.electronAPI
        .getConfig()
        .then((config: Config) => {
          setApiProvider(config.apiProvider || "openai");
          setAvailableKeys({
            openAI: !!config.openAIKey,
            anthropic: !!config.anthropicKey
          });
        })
        .catch((error: unknown) => {
          console.error("Failed to load config:", error);
          showToast("Error", "Failed to load settings", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, showToast]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Get current config to access stored API keys
      const currentConfig = await window.electronAPI.getConfig();
      
      let updates: {
        apiProvider: APIProvider;
        apiKey?: string;
      } = {
        apiProvider,
      };
      
      // Set the active API key based on selected provider
      if (apiProvider === 'openai' && currentConfig.openAIKey) {
        updates.apiKey = currentConfig.openAIKey;
      } else if (apiProvider === 'anthropic' && currentConfig.anthropicKey) {
        updates.apiKey = currentConfig.anthropicKey;
      }
      
      const result = await window.electronAPI.updateConfig(updates);
      
      if (result) {
        showToast("Success", "Provider changed successfully", "success");
        handleOpenChange(false);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      showToast("Error", "Failed to save settings", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md bg-black border border-white/10 text-white settings-dialog"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(450px, 90vw)',
          height: 'auto',
          minHeight: '400px',
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 9999,
          margin: 0,
          padding: '20px',
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          animation: 'fadeIn 0.25s ease forwards',
          opacity: 0.98
        }}
      >        
        <DialogHeader>
          <DialogTitle>Application Settings</DialogTitle>
          <DialogDescription className="text-white/70">
            Configure your AI provider preference and view keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* API Provider Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white">AI Provider</label>
            <p className="text-xs text-white/60 mb-2">
              Choose which AI provider to use. Your API keys are automatically loaded from your profile.
            </p>
            <div className="flex gap-2">
              <div
                className={`flex-1 p-3 rounded-lg transition-colors ${
                  !availableKeys.openAI
                    ? "bg-black/20 border border-white/5 opacity-50 cursor-not-allowed"
                    : apiProvider === "openai"
                    ? "bg-white/10 border border-white/20 cursor-pointer"
                    : "bg-black/30 border border-white/5 hover:bg-white/5 cursor-pointer"
                }`}
                onClick={() => availableKeys.openAI && setApiProvider("openai")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "openai" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">
                      OpenAI {!availableKeys.openAI && "(Not Available)"}
                    </p>
                    <p className="text-xs text-white/60">
                      {availableKeys.openAI ? "GPT-4 models" : "No API key in profile"}
                    </p>
                  </div>
                </div>
              </div>
              <div
                className={`flex-1 p-3 rounded-lg transition-colors ${
                  !availableKeys.anthropic
                    ? "bg-black/20 border border-white/5 opacity-50 cursor-not-allowed"
                    : apiProvider === "anthropic"
                    ? "bg-white/10 border border-white/20 cursor-pointer"
                    : "bg-black/30 border border-white/5 hover:bg-white/5 cursor-pointer"
                }`}
                onClick={() => availableKeys.anthropic && setApiProvider("anthropic")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "anthropic" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">
                      Anthropic {!availableKeys.anthropic && "(Not Available)"}
                    </p>
                    <p className="text-xs text-white/60">
                      {availableKeys.anthropic ? "Claude models" : "No API key in profile"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-2 mt-4">
            <label className="text-sm font-medium text-white mb-2 block">Keyboard Shortcuts</label>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div className="text-white/70">Toggle Visibility</div>
                <div className="text-white/90 font-mono">Ctrl+B / Cmd+B</div>
                
                <div className="text-white/70">Take Screenshot</div>
                <div className="text-white/90 font-mono">Ctrl+H / Cmd+H</div>
                
                <div className="text-white/70">Process Screenshots</div>
                <div className="text-white/90 font-mono">Ctrl+Enter / Cmd+Enter</div>
                
                <div className="text-white/70">Delete Last Screenshot</div>
                <div className="text-white/90 font-mono">Ctrl+L / Cmd+L</div>
                
                <div className="text-white/70">Reset View</div>
                <div className="text-white/90 font-mono">Ctrl+R / Cmd+R</div>
                
                <div className="text-white/70">Quit Application</div>
                <div className="text-white/90 font-mono">Ctrl+Q / Cmd+Q</div>
                
                <div className="text-white/70">Move Window</div>
                <div className="text-white/90 font-mono">Ctrl+Arrow Keys</div>
                
                <div className="text-white/70">Decrease Opacity</div>
                <div className="text-white/90 font-mono">Ctrl+[ / Cmd+[</div>
                
                <div className="text-white/70">Increase Opacity</div>
                <div className="text-white/90 font-mono">Ctrl+] / Cmd+]</div>
                
                <div className="text-white/70">Zoom Out</div>
                <div className="text-white/90 font-mono">Ctrl+- / Cmd+-</div>
                
                <div className="text-white/70">Reset Zoom</div>
                <div className="text-white/90 font-mono">Ctrl+0 / Cmd+0</div>
                
                <div className="text-white/70">Zoom In</div>
                <div className="text-white/90 font-mono">Ctrl+= / Cmd+=</div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-white/10 hover:bg-white/5 text-white"
          >
            Cancel
          </Button>
          <Button
            className="px-4 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={isLoading || (apiProvider === 'openai' && !availableKeys.openAI) || (apiProvider === 'anthropic' && !availableKeys.anthropic)}
          >
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
