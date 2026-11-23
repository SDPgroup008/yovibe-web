import { useEffect, useMemo, useState } from 'react';
import type { Venue } from '../models/Venue';
import { useCountry } from '../contexts/CountryContext';
import SupabaseService from '../services/SupabaseService';
import { useCachedVenues } from './useDataCache';

const empty: Venue[] = [];

export function useMapVenues(destinationId?: string) {
  const { country, ready } = useCountry();
  const { data, loading, refreshing, refetch } = useCachedVenues(country, ready);
  const [destination, setDestination] = useState<Venue | null>(null);
  const list = data || empty;
  const found = list.some(venue => venue.slug === destinationId || venue.id === destinationId);
  useEffect(() => {
    let active = true;
    if (destinationId && !found) {
      SupabaseService.getVenueById(destinationId).then(venue => {
        if (active) setDestination(venue);
      }).catch(() => { if (active) setDestination(null); });
    }
    return () => { active = false; };
  }, [destinationId, found]);
  const venues = useMemo(() => destinationId && !found && destination &&
    (destination.slug === destinationId || destination.id === destinationId) ? [...list, destination] : list,
  [list, destination, destinationId, found]);
  return { venues, loading: !ready || loading, refreshing, onRefresh: refetch };
}
