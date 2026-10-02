'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import PetsCard, { type Pet } from './PetsCard';
import { useUrlBool } from '@/lib/useUrlState';

// "Pets" link in the nav — opens the adoptable-pets list in a popup.
// The list is fetched the first time the popup opens.
export default function PetsNav() {
  const [open, setOpen] = useUrlBool('pets');
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || pets) return;
    fetch('/api/pets')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Pet[]>;
      })
      .then(setPets)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [open, pets]);

  return (
    <>
      <button type="button" className="site-nav-btn" onClick={() => setOpen(true)}>Pets</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Adoptable pets" size="xl">
        {error && <p className="muted">Couldn’t load: {error}</p>}
        {!pets && !error && <p className="muted">Loading…</p>}
        {pets && <PetsCard pets={pets} />}
      </Modal>
    </>
  );
}
