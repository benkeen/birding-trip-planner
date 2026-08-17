import { HistoricDataCache } from './src/main/cache.js'

const cache = new HistoricDataCache()

// Test data
const region = 'TEST_REGION'
const year = 2025
const month = 9
const day = 25
const testData = [
  { speciesCode: 'test1', comName: 'Test Bird 1' },
  { speciesCode: 'test2', comName: 'Test Bird 2' }
]

console.log(
  '1. Checking if cache exists:',
  cache.isCached(region, year, month, day)
)

console.log('2. Writing test data to cache...')
cache.set(region, year, month, day, testData)

console.log(
  '3. Checking if cache exists now:',
  cache.isCached(region, year, month, day)
)

console.log('4. Reading from cache...')
const retrieved = cache.get(region, year, month, day)
console.log('5. Retrieved data:', retrieved)

console.log('6. Match?', JSON.stringify(retrieved) === JSON.stringify(testData))
