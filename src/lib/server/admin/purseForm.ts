import { MAX_PHOTOS_PER_CALL, PhotoProblem, readPicture, type Picture } from '$lib/server/owner/images';
import type { NewPurse, PurseChanges, Status } from '$lib/server/owner/purses';

export type PurseFields = { name: string; price: string; sale_price: string; description: string; style: string; status: Status; sold: boolean };

const STATUSES: Status[] = ['live', 'draft', 'hidden'];

export function readFields(form: FormData): PurseFields {
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const status = text('status') as Status;
  return {
    name: text('name'),
    price: text('price'),
    sale_price: text('sale_price'),
    description: text('description'),
    style: text('style'),
    status: STATUSES.includes(status) ? status : 'live',
    sold: form.get('sold') === 'on',
  };
}

function dollars(v: string): number {
  return Number(v.replace(/[$,\s]/g, ''));
}

export function asNew(f: PurseFields): NewPurse {
  return { name: f.name, price: dollars(f.price), sale_price: f.sale_price ? dollars(f.sale_price) : null, description: f.description, style: f.style || null, status: f.status };
}

export function asChanges(f: PurseFields): PurseChanges {
  return { ...asNew(f), sold: f.sold };
}

export async function readUploads(form: FormData): Promise<{ pictures: Picture[]; problems: string[] }> {
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  const problems: string[] = [];
  const pictures: Picture[] = [];
  if (files.length > MAX_PHOTOS_PER_CALL) return { pictures, problems: [`Pick up to ${MAX_PHOTOS_PER_CALL} photos at a time.`] };
  for (const file of files) {
    try {
      pictures.push(readPicture(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      if (!(e instanceof PhotoProblem)) throw e;
      problems.push(`${file.name || 'A photo'}: ${e.message}`);
    }
  }
  return { pictures, problems };
}
