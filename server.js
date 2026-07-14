const express = require('express');
const app = express();
const PORTA = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Bot está rodando!');
});

app.listen(PORTA, () => {
  console.log(`🌐 Servidor de verificação rodando na porta ${PORTA}`);
});
