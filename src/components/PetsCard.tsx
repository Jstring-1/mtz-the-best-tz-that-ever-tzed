'use client';

import { useState } from 'react';
import Modal from './Modal';

export interface Pet {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  age: string | null;
  gender: string | null;
  weight: string | null;
  color: string | null;
  intake_date: string | null;
  location: string | null;
  photo_url: string | null;
  description: string | null;
  url: string | null;
  shelter: string | null;
}

type Tab = 'all' | 'dog' | 'cat';

// Round-robin interleave so the "All" view alternates species instead
// of showing every cat (or dog) stacked on top.
function interleaveBySpecies(pets: Pet[]): Pet[] {
  const buckets = new Map<string, Pet[]>();
  for (const p of pets) {
    const k = (p.species ?? 'other').toLowerCase();
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(p);
  }
  const lists = [...buckets.values()];
  const out: Pet[] = [];
  for (let i = 0; out.length < pets.length; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

export default function PetsCard({ pets }: { pets: Pet[] }) {
  const [open, setOpen] = useState<Pet | null>(null);
  const [tab, setTab] = useState<Tab>('all');

  const visible = tab === 'all'
    ? interleaveBySpecies(pets)
    : pets.filter((p) => (p.species ?? '').toLowerCase() === tab);
  const dogs = pets.filter((p) => (p.species ?? '').toLowerCase() === 'dog').length;
  const cats = pets.filter((p) => (p.species ?? '').toLowerCase() === 'cat').length;

  const switchTab = (t: Tab) => setTab(t);

  return (
    <section className="card-section pets-card">
      <h2>
        Adoptable pets
        <span className="event-tabs" role="tablist">
          <button type="button" className={`event-tab ${tab === 'all' ? 'on' : ''}`} onClick={() => switchTab('all')}>
            All <span className="count">{pets.length}</span>
          </button>
          <button type="button" className={`event-tab ${tab === 'dog' ? 'on' : ''}`} onClick={() => switchTab('dog')}>
            Dogs <span className="count">{dogs}</span>
          </button>
          <button type="button" className={`event-tab ${tab === 'cat' ? 'on' : ''}`} onClick={() => switchTab('cat')}>
            Cats <span className="count">{cats}</span>
          </button>
        </span>
      </h2>
      {visible.length === 0 ? (
        <p className="empty">No pets cached yet.</p>
      ) : (
        <>
          <div className="pets-grid">
            {visible.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pet-tile clickable"
                onClick={() => setOpen(p)}
                title={p.name}
              >
                {p.photo_url
                  ? <img src={p.photo_url} alt={p.name} loading="lazy" />
                  : <div className="pet-no-photo">no photo</div>}
                <span className="pet-name">{p.name}</span>
                <span className="pet-sub">
                  {[p.breed, p.age].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? 'Pet'} size="lg">
        {open && (
          <>
            {open.photo_url && (
              <img
                src={open.photo_url}
                alt={open.name}
                style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 4, marginBottom: 12 }}
              />
            )}
            <dl className="stock-modal-kv">
              {open.species && <><dt>Species</dt><dd>{open.species}</dd></>}
              {open.breed   && <><dt>Breed</dt>  <dd>{open.breed}</dd></>}
              {open.age     && <><dt>Age</dt>    <dd>{open.age}</dd></>}
              {open.gender  && <><dt>Gender</dt> <dd>{open.gender}</dd></>}
              {open.weight  && <><dt>Weight</dt> <dd>{open.weight}</dd></>}
              {open.color   && <><dt>Color</dt>  <dd>{open.color}</dd></>}
              {open.intake_date && <><dt>At shelter since</dt><dd>{open.intake_date}</dd></>}
              {open.location && <><dt>Location</dt><dd>{open.location}</dd></>}
              <dt>Shelter ID</dt><dd>{open.id}</dd>
              {open.shelter && <><dt>Shelter</dt><dd>{open.shelter}</dd></>}
            </dl>
            {open.description && <p style={{ lineHeight: 1.5, marginTop: 8 }}>{open.description}</p>}
            {open.url && (
              <a
                className="event-modal-btn primary"
                href={open.url}
                target="_blank"
                rel="noopener"
                style={{ marginTop: 14, display: 'inline-block' }}
              >View on 24petconnect →</a>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
