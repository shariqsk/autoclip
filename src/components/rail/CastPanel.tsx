// Cast: the people in your footage. Star who the edit is about (one, or several for a rivalry or a
// team) and cut anyone who shouldn't be in it; the edit and its framing follow.

import { Ban, Check, Combine, Star, Users } from 'lucide-react'
import { useState } from 'react'
import type { Person } from '../../lib/types'
import { findPeopleInFootage, mergePeople, renamePerson, setRole, unscannedClips } from '../../state/people'
import { useApp } from '../../state/store'
import { cx } from '../format'
import { Progress } from '../ui'

function PersonCard({ p, picking, picked, onPick }: { p: Person; picking: boolean; picked: boolean; onPick: () => void }) {
  return (
    <li
      className={cx(
        'cast-card relative overflow-hidden',
        p.role === 'star' && 'cast-card-star',
        p.role === 'cut' && 'cast-card-cut',
        picked && 'cast-card-picked',
      )}
    >
      <div className="cast-portrait relative aspect-square bg-bg-3">
        {p.thumb && <img src={p.thumb} alt={p.name || 'A person in your footage'} className="size-full object-cover" />}
        {picking && (
          <button
            className="absolute inset-0 grid place-items-start p-1.5"
            role="checkbox"
            aria-checked={picked}
            aria-label={`Pick ${p.name || 'this person'} to merge`}
            onClick={onPick}
          >
            <span className={cx('cast-pick grid size-6 place-items-center', picked && 'cast-pick-on')}>
              {picked && <Check className="size-3.5" />}
            </span>
          </button>
        )}
        <div className={cx('absolute top-1.5 right-1.5 flex gap-1', picking && 'hidden')}>
          <button
            className={cx('cast-role grid size-7 place-items-center', p.role === 'star' && 'cast-role-on')}
            title="Star: build the edit around them"
            aria-label={`Star ${p.name || 'this person'}`}
            aria-pressed={p.role === 'star'}
            onClick={() => setRole(p.id, 'star')}
          >
            <Star className={cx('size-3.5', p.role === 'star' && 'fill-current')} />
          </button>
          <button
            className={cx('cast-role grid size-7 place-items-center', p.role === 'cut' && 'cast-role-on')}
            title="Cut: keep them out of the edit"
            aria-label={`Keep ${p.name || 'this person'} out`}
            aria-pressed={p.role === 'cut'}
            onClick={() => setRole(p.id, 'cut')}
          >
            <Ban className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="space-y-0.5 p-2">
        <input
          className="cast-name w-full bg-transparent text-sm font-semibold outline-none placeholder:text-ink-3"
          placeholder="Name them"
          value={p.name}
          maxLength={32}
          onChange={(e) => renamePerson(p.id, e.target.value)}
          onBlur={(e) => e.target.value !== e.target.value.trim() && renamePerson(p.id, e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="text-[0.68rem] text-ink-3">
          {p.seconds}s on screen · {p.clipIds.length} clip{p.clipIds.length === 1 ? '' : 's'}
        </div>
      </div>
    </li>
  )
}

export function CastPanel() {
  const people = useApp((s) => s.people)
  const scan = useApp((s) => s.peopleScan)
  const hasVideo = useApp((s) => s.clips.some((c) => c.kind === 'video' && c.status === 'ready'))
  const newClips = useApp((s) => unscannedClips(s).length)
  const scanned = useApp((s) => Object.keys(s.faces).length > 0)
  const [all, setAll] = useState(false)
  const [picking, setPicking] = useState<string[] | null>(null)
  const stars = people.filter((p) => p.role === 'star')
  const shown = all ? people : people.slice(0, 8)

  if (!hasVideo) return <p className="text-sm text-ink-3">Add some footage, then find the people in it here.</p>

  if (scan)
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">Looking for faces…</div>
        <Progress value={scan.fraction} />
        <div className="tag">
          Clip {Math.min(scan.done + 1, scan.total)} of {scan.total} · on this device
        </div>
      </div>
    )

  if (!scanned)
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-ink-2">
          Find everyone in your footage, then pick who the edit is about. AutoClip puts them on screen, gives them the drop and frames on
          their face. Pick more than one for a rivalry or a team, and keep out anyone who shouldn't be in it.
        </p>
        <button className="btn btn-signal w-full" onClick={() => void findPeopleInFootage()}>
          <Users className="size-3.5" /> Find people
        </button>
        <p className="tag">Runs on this device: a few seconds per minute of footage.</p>
      </div>
    )

  return (
    <div className="space-y-3">
      {newClips > 0 && (
        <button className="btn w-full" onClick={() => void findPeopleInFootage()}>
          <Users className="size-3.5" /> Look in {newClips} new clip{newClips === 1 ? '' : 's'}
        </button>
      )}
      {people.length ? (
        <>
          <p className="text-xs leading-snug text-ink-2">
            {stars.length
              ? `The edit follows ${stars.map((p) => p.name || 'your star').join(' and ')}. Tap ★ again to undo.`
              : 'Tap ★ on who the edit is about. Pick more than one for a rivalry or a team; ⃠ keeps someone out.'}
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {shown.map((p) => (
              <PersonCard
                key={p.id}
                p={p}
                picking={!!picking}
                picked={!!picking?.includes(p.id)}
                onPick={() => setPicking((ids) => (ids?.includes(p.id) ? ids.filter((x) => x !== p.id) : [...(ids ?? []), p.id]))}
              />
            ))}
          </ul>
          {people.length > 1 &&
            (picking ? (
              <div className="flex gap-2">
                <button
                  className="btn btn-signal flex-1"
                  disabled={picking.length < 2}
                  onClick={() => {
                    mergePeople(picking)
                    setPicking(null)
                  }}
                >
                  <Combine className="size-3.5" /> Same person{picking.length > 1 ? ` (${picking.length})` : ''}
                </button>
                <button className="btn btn-bare" onClick={() => setPicking(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-bare btn-sm w-full"
                onClick={() => setPicking([])}
                title="When one person shows up twice (side-on, or behind a glove)"
              >
                <Combine className="size-3.5" /> Same person twice? Merge
              </button>
            ))}
          {people.length > 8 && (
            <button className="tag w-full text-center hover:text-ink" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${people.length}`}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-3">No faces were big enough to recognize. Close-ups and walkouts work best.</p>
      )}
    </div>
  )
}
