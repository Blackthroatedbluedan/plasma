import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

export default function InlinePartRename({ partId, name, onRenamed, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const cancelingRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    setValue(name);
  }, [name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const cancel = () => {
    cancelingRef.current = true;
    setValue(name);
    setEditing(false);
  };

  const save = async () => {
    if (savingRef.current) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      cancel();
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const updated = await api.updatePart(partId, { name: trimmed });
      onRenamed?.(updated);
      setEditing(false);
    } catch (e) {
      setValue(name);
      setEditing(false);
      onRenamed?.(null, e.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleBlur = () => {
    if (cancelingRef.current) {
      cancelingRef.current = false;
      return;
    }
    save();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`inline-rename-input ${className}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={handleBlur}
        disabled={saving}
        aria-label="Rename part"
      />
    );
  }

  return (
    <button
      type="button"
      className={`inline-rename-label ${className}`}
      onClick={() => setEditing(true)}
      title="Click to rename"
    >
      {name}
    </button>
  );
}
