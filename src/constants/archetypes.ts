import { IconName } from '@/src/components/core';

export interface Archetype {
    id: string;
    name: string;
    description: string;
    icon: IconName;
}

export const ARCHETYPES: Archetype[] = [
    {
        id: 'balance-glancer',
        name: 'The Balance Glancer',
        description: 'Check accounts mainly to see if you can afford something right now.',
        icon: 'eye',
    },
    {
        id: 'pattern-seeker',
        name: 'The Pattern Seeker',
        description: 'Find where money is leaking and identify hidden recurring costs.',
        icon: 'search',
    },
    {
        id: 'disciplined-planner',
        name: 'The Disciplined Planner',
        description: 'Set budgets and stick to them strictly.',
        icon: 'document',
    },
];

export const getArchetypeById = (id: string) => ARCHETYPES.find(a => a.id === id) || ARCHETYPES[0];
