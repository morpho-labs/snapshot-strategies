import { EnumType } from 'json-to-graphql-query';
import { getAddress } from '@ethersproject/address';
import { subgraphRequest } from '../../utils';

export const author = '2fd';
export const version = '0.1.0';

const SUBGRAPH_QUERY_ADDRESSES_LIMIT = 2000;
const REQUEST_DELAY_MS = 1000 / 10; // 10 requests per second
const DECENTRALAND_COLLECTIONS_SUBGRAPH_URL = {
  '1': 'https://subgraph.decentraland.org/collections-ethereum-mainnet',
  '137': 'https://subgraph.decentraland.org/collections-matic-mainnet',
  '80002': 'https://subgraph.decentraland.org/collections-matic-amoy'
};

function chunk(_array: string[], pageSize: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < _array.length; i += pageSize) {
    chunks.push(_array.slice(i, i + pageSize));
  }
  return chunks;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function strategy(
  space,
  network,
  provider,
  addresses,
  options,
  snapshot
) {
  // initialize scores
  const scores = {};
  for (const address of addresses) {
    scores[getAddress(address)] = 0;
  }

  // if graph doesn't exist return automatically
  if (!DECENTRALAND_COLLECTIONS_SUBGRAPH_URL[network]) {
    return scores;
  }

  const chunks = chunk(addresses, SUBGRAPH_QUERY_ADDRESSES_LIMIT);
  // initialize multipliers and params
  const multiplers = options.multipliers || {};

  for (const chunk of chunks) {
    const params = {
      nfts: {
        __args: {
          where: {
            itemType_in: [
              new EnumType('wearable_v1'),
              new EnumType('wearable_v2'),
              new EnumType('smart_wearable_v1'),
              new EnumType('emote_v1')
            ],
            owner_in: chunk.map((address) => address.toLowerCase()),
            id_gt: ''
          },
          orderBy: new EnumType('id'),
          orderDirection: new EnumType('asc'),
          first: 1000
        },
        id: true,
        owner: {
          id: true
        },
        searchWearableRarity: true
      }
    };

    if (options.collections) {
      // @ts-ignore
      params.nfts.__args.where.collection_in = options.collections;
    }

    if (snapshot !== 'latest') {
      // @ts-ignore
      params.nfts.__args.block = { number: snapshot };
    }

    // load and add each wearable by rarity
    let hasNext = true;
    while (hasNext) {
      await delay(REQUEST_DELAY_MS);

      const result = await subgraphRequest(
        DECENTRALAND_COLLECTIONS_SUBGRAPH_URL[network],
        params
      );

      const nfts = result && result.nfts ? result.nfts : [];
      const latest = nfts[nfts.length - 1];
      for (const wearable of nfts) {
        const userAddress = getAddress(wearable.owner.id);
        const rarity = String(wearable.searchWearableRarity)
          .toLowerCase()
          .trim();
        scores[userAddress] =
          (scores[userAddress] ?? 0) + (multiplers[rarity] ?? 0);
      }

      hasNext = nfts.length === params.nfts.__args.first;
      if (hasNext) {
        params.nfts.__args.where.id_gt = latest?.id || '';
      }
    }
  }

  // return result
  return scores;
}
