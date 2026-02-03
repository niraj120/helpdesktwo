import { useEffect, useCallback } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';
import { useNavigate } from 'react-router-dom';

/**
 * KeyboardShortcuts Hook
 * 
 * Implements global keyboard shortcuts for multi-tenant functionality:
 * - Ctrl/Cmd + K: Open project switcher
 * - Ctrl/Cmd + Shift + U: Toggle unified view
 * - 1-9: Quick switch to first 9 projects
 */

interface KeyboardShortcutsOptions {
  onProjectSwitcherOpen?: () => void;
  disableNumberShortcuts?: boolean;
}

export const useKeyboardShortcuts = (options: KeyboardShortcutsOptions = {}) => {
  const { 
    userProjects, 
    viewMode, 
    setViewMode,
    switchProject 
  } = useProjectContext();
  const navigate = useNavigate();

  const { onProjectSwitcherOpen, disableNumberShortcuts = false } = options;

  const handleKeyDown = useCallback(async (event: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? event.metaKey : event.ctrlKey;

    // Ctrl/Cmd + K: Open project switcher
    if (modKey && event.key === 'k') {
      event.preventDefault();
      console.log('🎹 Keyboard shortcut: Open project switcher (Ctrl/Cmd + K)');
      
      if (onProjectSwitcherOpen) {
        onProjectSwitcherOpen();
      } else {
        // Default: Focus on project switcher if it exists
        const switcher = document.querySelector('[data-project-switcher]') as HTMLElement;
        if (switcher) {
          switcher.click();
        }
      }
      return;
    }

    // Ctrl/Cmd + Shift + U: Toggle unified view
    if (modKey && event.shiftKey && event.key.toLowerCase() === 'u') {
      event.preventDefault();
      console.log('🎹 Keyboard shortcut: Toggle unified view (Ctrl/Cmd + Shift + U)');
      
      if (viewMode === 'unified') {
        // Switch to first project if in unified mode
        if (userProjects.length > 0) {
          await switchProject(userProjects[0]._id, {
            reload: true,
            navigate: true
          });
        }
      } else {
        // Switch to unified mode
        setViewMode('unified');
      }
      return;
    }

    // Number keys (1-9): Quick switch to projects
    if (!disableNumberShortcuts && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      const key = event.key;
      const numberMatch = key.match(/^[1-9]$/);
      
      if (numberMatch) {
        const index = parseInt(key) - 1;
        
        // Only trigger if not focused on input/textarea
        const activeElement = document.activeElement;
        const isInputFocused = 
          activeElement?.tagName === 'INPUT' || 
          activeElement?.tagName === 'TEXTAREA' ||
          activeElement?.getAttribute('contenteditable') === 'true';
        
        if (!isInputFocused && index < userProjects.length) {
          event.preventDefault();
          const project = userProjects[index];
          console.log(`🎹 Keyboard shortcut: Switch to project ${index + 1} (${project.name})`);
          
          await switchProject(project._id, {
            reload: true,
            navigate: true
          });
        }
      }
    }
  }, [
    userProjects,
    viewMode,
    setViewMode,
    switchProject,
    onProjectSwitcherOpen,
    disableNumberShortcuts
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
};

/**
 * KeyboardShortcutsHelp Component
 * Shows available keyboard shortcuts
 */
export const KeyboardShortcutsHelp: React.FC<{ show: boolean; onClose: () => void }> = ({ show, onClose }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && show) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [show, onClose]);

  if (!show) return null;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { keys: `${modKey} + K`, description: 'Open project switcher' },
    { keys: `${modKey} + Shift + U`, description: 'Toggle unified view' },
    { keys: '1-9', description: 'Quick switch to project (1st to 9th)' },
    { keys: 'Esc', description: 'Close dialogs' }
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f3f4f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px'
              }}
            >
              <span style={{ fontSize: '14px', color: '#374151' }}>
                {shortcut.description}
              </span>
              <kbd
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  color: '#667eea'
                }}
              >
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>

        <p style={{ marginTop: '16px', fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>
          Press <kbd style={{ 
            padding: '2px 6px', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '4px',
            fontFamily: 'monospace'
          }}>?</kbd> anytime to see this help
        </p>
      </div>
    </div>
  );
};

export default useKeyboardShortcuts;
