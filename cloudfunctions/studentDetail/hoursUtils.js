function roundHours(val) {
  return Math.round(val * 100) / 100
}

function validateHoursMutation(type, amount, currentPurchased, currentRemaining) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return { ok: false, message: '课时数必须为有效数字' }
  }

  const normalizedAmount = roundHours(amount)
  const purchased = roundHours(Number(currentPurchased) || 0)
  const remaining = roundHours(Number(currentRemaining) || 0)

  if (type === 'purchaseHours') {
    if (normalizedAmount <= 0) {
      return { ok: false, message: '购买课时数必须为正数' }
    }
    return {
      ok: true,
      logType: 'purchase',
      amount: normalizedAmount,
      nextPurchased: roundHours(purchased + normalizedAmount),
      nextRemaining: roundHours(remaining + normalizedAmount)
    }
  }

  if (type === 'adjustHours') {
    if (normalizedAmount === 0) {
      return { ok: false, message: '调整课时数必须为非零数字' }
    }
    const nextRemaining = roundHours(remaining + normalizedAmount)
    if (nextRemaining < 0) {
      return { ok: false, message: '调整后未上课时不能小于0' }
    }
    return {
      ok: true,
      logType: 'adjust',
      amount: normalizedAmount,
      nextPurchased: purchased,
      nextRemaining
    }
  }

  if (type === 'refundHours') {
    if (normalizedAmount <= 0) {
      return { ok: false, message: '退费课时数必须为正数' }
    }
    if (remaining < normalizedAmount) {
      return { ok: false, message: '退费课时数不能大于未上课时' }
    }
    return {
      ok: true,
      logType: 'refund',
      amount: normalizedAmount,
      nextPurchased: Math.max(0, roundHours(purchased - normalizedAmount)),
      nextRemaining: Math.max(0, roundHours(remaining - normalizedAmount))
    }
  }

  return { ok: false, message: '无效的操作类型' }
}

module.exports = {
  roundHours,
  validateHoursMutation
}
