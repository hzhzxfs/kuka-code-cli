/**
 * 测试进程启动前设置隔离的 KUKACODE_ROOT，避免读写用户真实的 ~/.kukacode。
 * node --test 每个测试文件一个进程，因此每个进程拿到独立的临时根目录。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const configured = process.env.KUKACODE_ROOT
const isDefaultRoot = !configured || configured === path.join(os.homedir(), '.kukacode')
if (isDefaultRoot) {
  process.env.KUKACODE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'kuka-test-root-'))
}
