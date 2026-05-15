// analyze_first_move.ts
// sim_match_logs から moveNumber=1 の初手を集計する
// full_record は配列形式: [{player, moveNumber, positioning, build, canonical_hash}, ...]

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface MoveEntry {
  player?: string
  moveNumber?: number
  positioning?: string
  build?: {
    type?: string
    gate?: number
    gates?: number[]
    placed?: number
    placedGateIds?: number[]
  }
  canonical_hash?: string
}

interface MatchLog {
  full_record: MoveEntry[] | null
  winner: string | null
  sim_policy: string | null
}

interface MoveStats {
  count: number
  black_wins: number
  white_wins: number
  draws: number
  // build type distribution
  build_types: Record<string, number>
}

function extractFirstMove(fullRecord: MoveEntry[]): string {
  // moveNumber=1 の手を探す（player='black', moveNumber=1）
  const firstMove = fullRecord.find(m => m.moveNumber === 1 && m.player === 'black')
    ?? fullRecord[0]  // fallback: 最初の要素

  if (!firstMove) return 'unknown'

  // positioning をキーとして使う（A-M等のラベル）
  if (firstMove.positioning) {
    return firstMove.positioning
  }

  return 'unknown'
}

function extractFirstMoveDetail(fullRecord: MoveEntry[]): { positioning: string; buildType: string } {
  const firstMove = fullRecord.find(m => m.moveNumber === 1 && m.player === 'black')
    ?? fullRecord[0]

  if (!firstMove) return { positioning: 'unknown', buildType: 'unknown' }

  return {
    positioning: firstMove.positioning ?? 'unknown',
    buildType: firstMove.build?.type ?? 'unknown'
  }
}

async function main() {
  console.log('=== sim_easy 初手分析 ===\n')

  // 構造確認済み: full_record は MoveEntry[] 配列
  // moveNumber=1 の player='black' が初手

  // 総件数確認
  const { count: totalCount } = await supabase
    .from('sim_match_logs')
    .select('*', { count: 'exact', head: true })
    .eq('sim_policy', 'easy_vs_easy')
    .not('winner', 'is', null)

  console.log(`総対象局数: ${totalCount}`)

  // ページネーションで全件取得・集計
  const moveStats: Record<string, MoveStats> = {}
  const PAGE_SIZE = 1000
  let offset = 0
  let processed = 0
  let noMoveCount = 0

  // positioning × build_type の複合集計
  const detailStats: Record<string, Record<string, { count: number; black: number; white: number; draw: number }>> = {}

  console.log('集計中...')

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('full_record, winner')
      .eq('sim_policy', 'easy_vs_easy')
      .not('winner', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      console.error('取得エラー:', error)
      break
    }

    if (!data || data.length === 0) break

    for (const row of data as MatchLog[]) {
      if (!row.full_record || !Array.isArray(row.full_record) || row.full_record.length === 0) {
        noMoveCount++
        continue
      }

      const { positioning, buildType } = extractFirstMoveDetail(row.full_record)
      const winner = row.winner ?? 'unknown'

      // positioning 集計
      if (!moveStats[positioning]) {
        moveStats[positioning] = {
          count: 0,
          black_wins: 0,
          white_wins: 0,
          draws: 0,
          build_types: {}
        }
      }
      moveStats[positioning].count++
      if (winner === 'black') moveStats[positioning].black_wins++
      else if (winner === 'white') moveStats[positioning].white_wins++
      else if (winner === 'draw') moveStats[positioning].draws++

      moveStats[positioning].build_types[buildType] =
        (moveStats[positioning].build_types[buildType] ?? 0) + 1

      // positioning × buildType 複合集計
      if (!detailStats[positioning]) detailStats[positioning] = {}
      if (!detailStats[positioning][buildType]) {
        detailStats[positioning][buildType] = { count: 0, black: 0, white: 0, draw: 0 }
      }
      detailStats[positioning][buildType].count++
      if (winner === 'black') detailStats[positioning][buildType].black++
      else if (winner === 'white') detailStats[positioning][buildType].white++
      else if (winner === 'draw') detailStats[positioning][buildType].draw++
    }

    processed += data.length
    offset += PAGE_SIZE

    if (processed % 10000 === 0) {
      process.stdout.write(`  ${processed}件処理済み...\n`)
    }

    if (data.length < PAGE_SIZE) break
  }

  console.log(`処理完了: ${processed}件 (full_record空: ${noMoveCount}件)\n`)

  // 集計結果を整形
  const entries = Object.entries(moveStats).map(([positioning, stats]) => ({
    positioning,
    count: stats.count,
    rate: (stats.count / processed * 100).toFixed(2),
    black_wins: stats.black_wins,
    white_wins: stats.white_wins,
    draws: stats.draws,
    black_win_rate: stats.count > 0
      ? (stats.black_wins / stats.count * 100).toFixed(2)
      : '0.00',
    build_types: stats.build_types
  }))

  // ソート
  const byCount = [...entries].sort((a, b) => b.count - a.count)
  const eligible = entries.filter(e => e.count >= 100)
  const byBlackWin = [...eligible].sort((a, b) => Number(b.black_win_rate) - Number(a.black_win_rate))
  const byBlackWinWorst = [...eligible].sort((a, b) => Number(a.black_win_rate) - Number(b.black_win_rate))

  const tableHeader = '| positioning | count | rate(%) | black_wins | white_wins | draws | black_win_rate(%) |'
  const tableSep    = '|-------------|-------|---------|------------|------------|-------|------------------|'

  const toRow = (e: typeof entries[0]) =>
    `| ${e.positioning} | ${e.count} | ${e.rate} | ${e.black_wins} | ${e.white_wins} | ${e.draws} | ${e.black_win_rate} |`

  console.log('## sim_easy 初手分析レポート')
  console.log()
  console.log('### 基本情報')
  console.log(`- 総対象局数: ${processed}`)
  console.log(`- 初手positioningユニーク数: ${entries.length}`)
  console.log()
  console.log('### 全初手一覧テーブル（出現回数順）')
  console.log(tableHeader)
  console.log(tableSep)
  byCount.forEach(e => console.log(toRow(e)))
  console.log()
  console.log('### 出現回数トップ10')
  console.log(tableHeader)
  console.log(tableSep)
  byCount.slice(0, 10).forEach(e => console.log(toRow(e)))
  console.log()
  console.log('### black勝率トップ10（出現100回以上）')
  console.log(tableHeader)
  console.log(tableSep)
  byBlackWin.slice(0, 10).forEach(e => console.log(toRow(e)))
  console.log()
  console.log('### black勝率ワースト10（出現100回以上）')
  console.log(tableHeader)
  console.log(tableSep)
  byBlackWinWorst.slice(0, 10).forEach(e => console.log(toRow(e)))
  console.log()

  // build_type 分布
  console.log('### 初手build_type分布（positioning別）')
  byCount.forEach(e => {
    const types = Object.entries(e.build_types)
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `${t}:${c}`)
      .join(', ')
    console.log(`- **${e.positioning}** (${e.count}局): ${types}`)
  })

  // positioning × buildType 詳細テーブル
  console.log()
  console.log('### positioning × build_type 複合集計（出現100回以上）')
  console.log('| positioning | build_type | count | black_win_rate(%) |')
  console.log('|-------------|------------|-------|------------------|')
  for (const [pos, btMap] of Object.entries(detailStats)) {
    for (const [bt, s] of Object.entries(btMap)) {
      if (s.count >= 100) {
        const bwr = (s.black / s.count * 100).toFixed(2)
        console.log(`| ${pos} | ${bt} | ${s.count} | ${bwr} |`)
      }
    }
  }
}

main().catch(console.error)
