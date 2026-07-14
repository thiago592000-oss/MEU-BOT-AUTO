require('dotenv').config();
require('./server');

const { Client } = require('discord.js-selfbot-v13');

const TOKEN = process.env.TOKEN;
if (!TOKEN) return console.log('❌ COLOQUE O TOKEN NAS VARIÁVEIS!');

const PREFIXO = '.';
const ID_SERVIDOR = '1455231465645281365';
const ID_CANAL_PAINEL = '1515247489542783007';

const CARGOS_SAUDECAO = [
    '1455231465808855296', '1485824571641827378', '1455367218064920774',
    '1458269671957725326', '1458270563867955404', '1455231465892876304',
    '1456776648220217598', '1513364601192976424'
];

const PADRAO_RENOME = '🛠️ EM ATENDIMENTO';
// ✅ FRASES EXATAS QUE O PESSOAL MANDA
const FRASES_ATIVACAO = [
    'bom dia jogador (a), como posso lhe ajudar?',
    'boa tarde jogador (a), como posso lhe ajudar?',
    'boa noite jogador (a), como posso lhe ajudar?',
    'bom dia jogador(a), como posso lhe ajudar?',
    'boa tarde jogador(a), como posso lhe ajudar?',
    'boa noite jogador(a), como posso lhe ajudar?',
    'bom dia jogador (a), como posso lhe ajudar?',
    'boa tarde jogador (a), como posso lhe ajudar?',
    'boa noite jogador (a), como posso lhe ajudar?',
    'bom dia jogador (a), como posso lhe ajudar?',
    'boa tarde jogador (a), como posso lhe ajudar?',
    'boa noite jogador (a), como posso lhe ajudar?'
];

let ID_ASSUMIR = 'assumir';
let ID_FINALIZAR = 'finalizar';

const client = new Client({
    checkUpdate: false,
    intents: ['Guilds', 'GuildMessages', 'MessageContent', 'GuildMembers']
});

let sistemaAtivo = false;
let canaisJaAvisados = new Set();
let renomeioSalvo = new Map();
let contadorTickets = {};
let SEU_ID = null;
let usuariosComPermissao = new Set();

function pegarSaudacao() {
    const horaBrasilia = new Date(Date.now() - 3 * 3600000).getHours();
    if (horaBrasilia >= 5 && horaBrasilia < 12) return 'Bom dia';
    if (horaBrasilia >= 12 && horaBrasilia < 18) return 'Boa tarde';
    return 'Boa noite';
}

function formatarNomeServidor(nomeServidor) {
    if (!nomeServidor) return `${PADRAO_RENOME} (SUPORTE)`;
    let nome = nomeServidor.trim();
    nome = nome.replace(/^(AUXILIAR|SUPORTE)\s+/i, '');
    const primeiroNome = nome.trim().split(/\s+/)[0].toUpperCase();
    return `${PADRAO_RENOME} (${primeiroNome || 'SUPORTE'})`;
}

async function lerPainelAtualizarTickets() {
    if (!SEU_ID) return;
    console.log('\n🔄 LENDO PAINEL...');
    try {
        const servidor = await client.guilds.fetch(ID_SERVIDOR);
        const canal = await servidor.channels.fetch(ID_CANAL_PAINEL);
        if (!canal) return console.log('❌ Canal do painel não encontrado!');

        const msgs = await canal.messages.fetch({ limit: 100, force: true });
        let mensagemRanking = null;
        for (const msg of msgs.values()) {
            if (msg.content.includes('Ranking de Tickets') || msg.embeds.length > 0) {
                mensagemRanking = msg;
                break;
            }
        }
        if (!mensagemRanking) return console.log('❌ Mensagem do ranking não encontrada!');

        let textoTotal = mensagemRanking.content;
        mensagemRanking.embeds.forEach(emb => {
            textoTotal += ` ${emb.title || ''} ${emb.description || ''}`;
            if (emb.fields) emb.fields.forEach(f => textoTotal += ` ${f.name} ${f.value}`);
        });

        contadorTickets = {};
        const regex = /<@(\d{17,20})>\s+`\1`:\s+`(\d{1,5})`/g;
        let match;
        while ((match = regex.exec(textoTotal)) !== null) {
            contadorTickets[match[1]] = parseInt(match[2]);
        }
        console.log(`✅ ${Object.keys(contadorTickets).length} usuários carregados do ranking!`);

        await verificarECarregarNovosIds(servidor, textoTotal);

    } catch (e) { console.log(`❌ Erro leitura: ${e.message}`); }
}

async function verificarECarregarNovosIds(servidor, textoTotal) {
    const regexIds = /<@(\d{17,20})>/g;
    const idsPainel = [...new Set(textoTotal.matchAll(regexIds).map(m => m[1]))].filter(id => id !== SEU_ID);
    
    let novosUsuarios = 0;
    for (const id of idsPainel) {
        if (!renomeioSalvo.has(id)) {
            try {
                const membro = await servidor.members.fetch(id);
                renomeioSalvo.set(id, formatarNomeServidor(membro.displayName));
                novosUsuarios++;
                console.log(`✅ NOVO USUÁRIO DETECTADO! .ID salvo: <@${id}> → ${renomeioSalvo.get(id)}`);
            } catch { console.log(`⚠️ Não foi buscar dados de <@${id}>`); }
        }
    }
    if (novosUsuarios > 0) console.log(`📌 ${novosUsuarios} novos usuários configurados!`);
}

client.on('messageCreate', async (msg) => {
    if (!msg.guild) return;

    const comando = msg.content.trim().toLowerCase();
    if (comando.startsWith('.b ') && msg.author.id === SEU_ID) {
        try { await msg.delete().catch(()=>{}); } catch {}
        const idMensagem = comando.slice(3).trim();
        if (!/^\d{17,20}$/.test(idMensagem)) return console.log('❌ Use: .b ID_DA_MENSAGEM');
        try {
            const msgAlvo = await msg.channel.messages.fetch(idMensagem, { force: true });
            if (msgAlvo.components.length === 0) return console.log('❌ Essa mensagem não tem botões!');
            msgAlvo.components.forEach((linha, l) => {
                linha.components.forEach((botao, b) => {
                    console.log(`🔘 Botão ${l+1}.${b+1}: ${botao.label} | ID: ${botao.customId}`);
                });
            });
        } catch (e) { console.log(`❌ Erro: ${e.message}`); }
        return;
    }

    // ✅ REGRAS CORRIGIDAS: AGORA RECONHECE A FRASE EXATA E RENOMEIA
    const textoLimpo = msg.content.trim().toLowerCase()
        .replace(/\s+/g, ' ') // Remove espaços duplicados
        .replace(/[áàâãä]/g, 'a')
        .replace(/[éèêë]/g, 'e')
        .replace(/[íìîï]/g, 'i')
        .replace(/[óòôõö]/g, 'o')
        .replace(/[úùûü]/g, 'u')
        .replace(/[^\w\s()?:]/g, '');

    const fraseAtivada = FRASES_ATIVACAO.some(frase => {
        const f = frase.toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[áàâãä]/g, 'a')
            .replace(/[éèêë]/g, 'e')
            .replace(/[íìîï]/g, 'i')
            .replace(/[óòôõö]/g, 'o')
            .replace(/[úùûü]/g, 'u')
            .replace(/[^\w\s()?:]/g, '');
        return textoLimpo.includes(f);
    });

    if (fraseAtivada) {
        console.log(`🔔 FRASE DETECTADA DE <@${msg.author.id}>!`);
        if (renomeioSalvo.has(msg.author.id) && usuariosComPermissao.has(msg.author.id)) {
            if (!canaisJaAvisados.has(msg.channel.id)) {
                canaisJaAvisados.add(msg.channel.id);
                try {
                    await msg.channel.setName(renomeioSalvo.get(msg.author.id));
                    console.log(`✅ CANAL RENOMEADO COM SUCESSO POR <@${msg.author.id}>!`);
                } catch (e) {
                    console.log(`❌ ERRO AO RENOMEAR: ${e.message}`);
                }
            }
        } else {
            console.log(`⚠️ <@${msg.author.id}> não tem permissão ou não está cadastrado!`);
        }
        return;
    }

    if (sistemaAtivo && !canaisJaAvisados.has(msg.channel.id)) {
        const temCargo = CARGOS_SAUDECAO.some(id => msg.content.includes(`<@&${id}>`));
        if (temCargo) {
            canaisJaAvisados.add(msg.channel.id);
            try {
                await msg.channel.send(`${pegarSaudacao()} Jogador (a), Como Posso Lhe Ajudar?`);
                const eu = await msg.guild.members.fetch(SEU_ID);
                await msg.channel.setName(formatarNomeServidor(eu.displayName));
            } catch {}
        }
    }

    if (!msg.content.startsWith(PREFIXO)) return;
    const eVoce = msg.author.id === SEU_ID;
    // ✅ PERMISSÃO CORRIGIDA: VOCÊ + QUEM TEM PERMISSÃO PODE USAR
    const temPermissao = eVoce || usuariosComPermissao.has(msg.author.id);
    const args = msg.content.slice(PREFIXO.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'rank') {
        if (!eVoce) {
            await msg.channel.send('❌ Sem Permissão!').then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            return;
        }
        try {
            await msg.delete().catch(()=>{});
            await lerPainelAtualizarTickets();
            const ranking = Object.entries(contadorTickets)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 25)
                .map(([id, qtd], i) => `${i+1}º <@${id}>: ${qtd} tickets`)
                .join('\n');
            const msgRank = await msg.channel.send(`📈 **RANKING DE SUPORTE - ATUALIZADO**\n\n${ranking || 'Nenhum dado encontrado!'}`);
            setTimeout(() => msgRank.delete().catch(()=>{}), 15000);
        } catch {}
        return;
    }

    // ✅ COMANDOS PÚBLICOS: AGORA FUNCIONAM PARA QUEM TEM PERMISSÃO
    if (cmd === 'a') {
        if (!temPermissao) return;
        try {
            const alvo = msg.mentions.users.first();
            if (!alvo) return;
            const membro = await msg.guild.members.fetch(alvo.id);
            await msg.channel.setName(membro.displayName);
            console.log(`✅ Comando .a usado por <@${msg.author.id}>`);
        } catch {}
        return;
    }

    if (cmd === 'r') {
        if (!temPermissao) return;
        const novoNome = args.join(' ');
        if (!novoNome) return;
        try { 
            await msg.channel.setName(novoNome); 
            console.log(`✅ Comando .r usado por <@${msg.author.id}>`);
        } catch {}
        return;
    }

    if (!eVoce) return;

    if (cmd === 'perm') {
        try {
            await msg.delete().catch(()=>{});
            const mencionado = msg.mentions.users.first();

            if (mencionado) {
                usuariosComPermissao.add(mencionado.id);
                console.log(`✅ Permissão concedida: <@${mencionado.id}>`);
                await msg.channel.send(`✅ Permissão concedida para <@${mencionado.id}> — já pode usar comandos e renomear!`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            } 
            else if (msg.content.includes('@here')) {
                let total = 0;
                for (const id of renomeioSalvo.keys()) {
                    usuariosComPermissao.add(id);
                    total++;
                }
                console.log(`✅ Permissão concedida a TODOS (${total} usuários)`);
                await msg.channel.send(`✅ Permissão concedida para **todos os ${total} usuários cadastrados**!`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }
            else {
                await msg.channel.send('❌ Use: `.perm @usuario` ou `.perm @here`').then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }
        } catch {}
        return;
    }

    if (cmd === 'remperm') {
        try {
            await msg.delete().catch(()=>{});
            const mencionado = msg.mentions.users.first();

            if (mencionado) {
                usuariosComPermissao.delete(mencionado.id);
                console.log(`✅ Permissão removida: <@${mencionado.id}>`);
                await msg.channel.send(`✅ Permissão removida de <@${mencionado.id}>`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            } 
            else if (msg.content.includes('@here')) {
                const total = usuariosComPermissao.size;
                usuariosComPermissao.clear();
                console.log(`✅ Permissão removida de TODOS (${total} usuários)`);
                await msg.channel.send(`✅ Permissão removida de **todos os ${total} usuários cadastrados**!`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }
            else {
                await msg.channel.send('❌ Use: `.remperm @usuario` ou `.remperm @here`').then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }
        } catch {}
        return;
    }

    if (cmd === 'verperm') {
        try {
            let lista = '📋 **LISTA DE USUÁRIOS CADASTRADOS**\n\n';
            let posicao = 1;
            for (const [id] of renomeioSalvo) {
                const status = usuariosComPermissao.has(id) ? '✅ com permissão' : '❌ sem permissão';
                lista += `${posicao}. <@${id}> ${status}\n`;
                posicao++;
            }
            if (renomeioSalvo.size === 0) lista += 'Nenhum usuário cadastrado ainda.';
            await msg.channel.send(lista).then(m => setTimeout(() => m.delete().catch(()=>{}), 20000));
        } catch {}
        return;
    }

    if (cmd === 'ativar') {
        try { await msg.delete().catch(()=>{}); } catch {}
        sistemaAtivo = true;
        canaisJaAvisados.clear();
        console.log('✅ Sistema ativado!');
        return;
    }

    if (cmd === 'parar') {
        try { await msg.delete().catch(()=>{}); } catch {}
        sistemaAtivo = false;
        console.log('✅ Sistema desativado!');
        return;
    }

    if (cmd === 'aa') {
        try {
            const primeiraMsg = await msg.channel.messages.fetch({ after: '000000000000000000', limit: 1, force: true });
            const msgBotoes = primeiraMsg.first();
            if (!msgBotoes || msgBotoes.components.length === 0) return console.log('❌ Nenhuma mensagem com botões!');
            await msgBotoes.clickButton(ID_ASSUMIR);
            setTimeout(async () => {
                await msgBotoes.clickButton(ID_FINALIZAR);
            }, 1000);
        } catch (e) { console.log(`❌ ERRO NO .aa: ${e.message}`); }
        return;
    }

    if (cmd === 'id') {
        try {
            const alvo = msg.mentions.users.first();
            if (!alvo) return;
            const membro = await msg.guild.members.fetch(alvo.id);
            renomeioSalvo.set(alvo.id, formatarNomeServidor(membro.displayName));
            console.log(`✅ .ID salvo manualmente: <@${alvo.id}>`);
        } catch {}
        return;
    }
});

client.on('messageUpdate', async (_, nova) => {
    if (nova.channelId === ID_CANAL_PAINEL) await lerPainelAtualizarTickets();
});

client.on('ready', async () => {
    SEU_ID = client.user.id;
    console.log(`✅ BOT LIGADO! TODOS OS PROBLEMAS CORRIGIDOS!`);
    await lerPainelAtualizarTickets();
    setInterval(lerPainelAtualizarTickets, 10000);
});

client.login(TOKEN).catch(e => console.log(`❌ ERRO LOGIN: ${e.message}`));
