const express = require('express');
const cors = require('cors');
const db = require('./db'); // Importa a conexão configurada no db.js

const app = express();
const PORT = process.env.PORT || 3000;

// Habilita o CORS para que o Cordova (mesmo rodando em file:// ou localhost) acesse a API
app.use(cors());

// Aumenta o limite para suportar múltiplas imagens pesadas vindas do celular
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ROTA POST principal: Salva a vistoria completa de forma transacional
app.post('/api/vistoria', async (req, res) => {
  const { veiculo, fotos, estados_estruturais, estepe, macaco } = req.body;

  // Validação simples de segurança
  if (!veiculo) {
    return res.status(400).json({ status: 'erro', erro: 'O nome do veículo é obrigatório.' });
  }

  try {
    // Inicia a transação. Se houver falha no meio do processo, nada é inserido.
    await db.query('BEGIN');

    // 1. Insere os dados principais na tabela 'vistorias'
    const queryVistoria = `
      INSERT INTO vistorias (veiculo, estepe, macaco) 
      VALUES ($1, $2, $3) 
      RETURNING id;
    `;
    
    const v_estepe = estepe || 'Não Informado';
    const v_macaco = macaco || 'Não Informado';

    const resultadoVistoria = await db.query(queryVistoria, [veiculo, v_estepe, v_macaco]);
    const vistoriasId = resultadoVistoria.rows[0].id;

    // 2. Processa e insere cada foto na tabela 'vistoria_fotos'
    if (fotos && typeof fotos === 'object') {
      const areas = Object.keys(fotos);

      for (let area of areas) {
        const stringBase64 = fotos[area];
        
        // Pula se a área não contiver imagem válida
        if (!stringBase64 || stringBase64.length < 50) continue;

        // Recupera o estado selecionado para aquela área (padrão 'Bom')
        const estadoArea = estados_estruturais && estados_estruturais[area] ? estados_estruturais[area] : 'Bom';
        
        // Na nuvem (Render), salvamos a string Base64 diretamente no banco (campo TEXT)
        // Isso evita que as imagens sumam quando o container do Render reiniciar.
        const caminhoImagem = stringBase64;

        // Insere associando ao ID gerado no passo anterior
        const queryFoto = `
          INSERT INTO vistoria_fotos (vistoria_id, area, estado, imagem_url)
          VALUES ($1, $2, $3, $4);
        `;
        await db.query(queryFoto, [vistoriasId, area, estadoArea, caminhoImagem]);
      }
    }

    // Se tudo correr bem, efetiva as alterações no banco de dados
    await db.query('COMMIT');
    
    console.log(`✓ Vistoria do [${veiculo}] processada e salva com sucesso.`);
    return res.status(201).json({ 
      status: 'sucesso', 
      message: 'Vistoria e fotos salvas com sucesso!',
      id: vistoriasId 
    });

  } catch (error) {
    // Desfaz as inserções incompletas caso ocorra qualquer pane de processamento
    await db.query('ROLLBACK');
    console.error('❌ Erro crítico ao salvar vistoria:', error);
    return res.status(500).json({ status: 'erro', erro: 'Erro interno ao salvar os dados.', detalhe: error.message });
  }
});

// Inicia o servidor localmente ou na porta definida pelo Render
app.listen(PORT, () => {
  console.log(`🚀 API rodando com sucesso na porta: ${PORT}`);
});