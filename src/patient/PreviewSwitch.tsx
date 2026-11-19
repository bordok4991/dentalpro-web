import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loading } from '../components/ui';
import { patientPreview } from './preview';

/**
 * Ulaz i izlaz iz pregleda "kao pacijent" idu preko adrese, pa se prvo
 * promijeni adresa, a tek onda ekran (panel ordinacije ili aplikacija pacijenta).
 */
export function EnterPreview() {
  const { id = '' } = useParams();
  useEffect(() => {
    if (id) patientPreview.set(id);
  }, [id]);
  return <Loading />;
}

export function ExitPreview() {
  useEffect(() => {
    patientPreview.set(null);
  }, []);
  return <Loading />;
}
