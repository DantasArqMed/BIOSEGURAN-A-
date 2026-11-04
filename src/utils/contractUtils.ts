import extenso from 'extenso';

/**
 * Converte um valor numérico para extenso (BRL).
 */
export function valorPorExtenso(valor: number): string {
  if (isNaN(valor)) return '';
  return extenso(valor.toFixed(2).replace('.', ','), { mode: 'currency', currency: { type: 'BRL' } });
}

/**
 * Converte a data atual ou uma data específica para formato extenso em português.
 * Exemplo: vinte e quatro de abril de dois mil e vinte e seis.
 */
export function dataPorExtenso(data: Date = new Date()): string {
  const meses = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
  ];
  
  const dia = data.getDate().toString().padStart(2, '0');
  const mes = meses[data.getMonth()];
  const ano = data.getFullYear();
  
  return `${dia} DE ${mes} DE ${ano}`;
}
