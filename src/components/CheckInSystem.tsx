import React, { useState, useRef, useEffect } from 'react';
import { FileSpreadsheet, Send, MessageSquare, Check, Loader2, Calendar, Clock, User, Phone, MapPin } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, get, child, update } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB3l8UhFqxq_A2hX-TyEGqyjwQ-16Fwl8s",
  authDomain: "sistema-checkin-dcd59.firebaseapp.com",
  projectId: "sistema-checkin-dcd59",
  storageBucket: "sistema-checkin-dcd59.appspot.com",
  messagingSenderId: "1002354647777",
  appId: "1:1002354647777:web:c09f5b8ed95c1e82ca39a9",
  databaseURL: "https://sistema-checkin-dcd59-default-rtdb.firebaseio.com"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

interface CheckInData {
  Checkin: string;
  Checkout: string;
  Responsável: string;
  'Telefone Responsável': string;
  Unidade: string;
  Localizador: string;
  Categoria: string;
  'Quantidade Hóspede': string;
  'Documento do Responsavel': string;
  'Nome Estabelecimento': string;
}

interface MessageTemplate {
  audaar: string;
  lobie: string;
}

const messageTemplates: MessageTemplate = {
  audaar: `Olá {nome}! 

Bem-vindo ao {unidade}!
Seu check-in está agendado para: {checkin}
Localizador: {localizador}

Para fazer seu check-in online, acesse: https://pms.audaar.com.br/checkin/vivapp/access

Tenha uma ótima estadia! `,
  lobie: `Olá {nome}! 

Bem-vindo ao {unidade}!
Seu check-in está agendado para: {checkin}
Localizador: {localizador}

Faça seu check-in online aqui: https://pms.audaar.com.br/checkin/vivapp/access

Aguardamos você! `
};

export function CheckInSystem() {
  const [activeTab, setActiveTab] = useState('report');
  const [initDate, setInitDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [establishment, setEstablishment] = useState('all');
  const [reportUrl, setReportUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CheckInData[]>([]);
  const [filteredData, setFilteredData] = useState<CheckInData[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(0);
  const [sentMessages, setSentMessages] = useState<Set<number>>(new Set());
  const [currentMessageIndex, setCurrentMessageIndex] = useState<number | null>(null);
  const [showMessageHistory, setShowMessageHistory] = useState(false);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const [sentMessagesDetails, setSentMessagesDetails] = useState<Map<number, { timestamp: string, success: boolean }>>(new Map());
  const [messageTracker, setMessageTracker] = useState<Map<string, { timestamp: string, success: boolean }>>(new Map());
  const [isOnline, setIsOnline] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'error' | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Autenticar anonimamente no Firebase
  useEffect(() => {
    const authenticateUser = async () => {
      try {
        const userCredential = await signInAnonymously(auth);
        console.log('Autenticado anonimamente com ID:', userCredential.user.uid);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Erro na autenticação anônima:', error);
        setIsAuthenticated(false);
      }
    };
    
    authenticateUser();
  }, []);

  // Monitorar status de conexão
  useEffect(() => {
    function handleOnlineStatus() {
      setIsOnline(navigator.onLine);
    }
    
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    // Verificar o status atual
    handleOnlineStatus();
    
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  const formatDateToPtBR = (date: string) => {
    if (!date || date.trim() === '') return '';
    
    try {
      // Se a data já estiver no formato dd/mm/yyyy, retornar como está
      if (date.includes('/') && date.split('/').length === 3) {
        const parts = date.split('/');
        // Verificar se parece um formato válido (dia/mês/ano)
        if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length >= 4) {
          return date; // Já está no formato correto
        }
      }
      
      // Se a data estiver no formato yyyy-mm-dd
      if (date.includes('-') && date.split('-').length === 3) {
        const [year, month, day] = date.split('-');
        if (!year || !month || !day) return '';
        
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
      
      // Tentar converter de outros formatos possíveis
      const dateObj = new Date(date);
      if (!isNaN(dateObj.getTime())) {
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        return `${day}/${month}/${year}`;
      }
      
      console.warn('Formato de data não reconhecido:', date);
      return date; // Retornar o original se não conseguir converter
    } catch (error) {
      console.error('Erro ao formatar data:', error, date);
      return date; // Retornar o original em caso de erro
    }
  };

  const formatPhoneNumber = (phone: string): string => {
    // Remove all non-numeric characters
    const numbers = phone.replace(/\D/g, '');
    
    // Add Brazil country code if not present
    if (!numbers.startsWith('55')) {
      return `55${numbers}`;
    }
    return numbers;
  };

  const generateWhatsAppMessage = (data: CheckInData, template: 'audaar' | 'lobie'): string => {
    const messageTemplate = messageTemplates[template];
    
    // Formatar a data apenas se ela existir
    let formattedDate = '';
    if (data.Checkin && data.Checkin.trim() !== '') {
      formattedDate = formatDateToPtBR(data.Checkin);
    }
    
    return messageTemplate
      .replace('{nome}', data.Responsável || '')
      .replace('{localizador}', data.Localizador || '')
      .replace('{checkin}', formattedDate)
      .replace('{unidade}', data['Nome Estabelecimento'] || '');
  };

  const generateWhatsAppUrl = (data: CheckInData): string => {
    const phoneNumber = formatPhoneNumber(data['Telefone Responsável']);
    const template = data['Nome Estabelecimento'].toLowerCase().includes('lobie') ? 'lobie' : 'audaar';
    const message = generateWhatsAppMessage(data, template);
    return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
  };

  const openWhatsApp = (data: CheckInData, index: number) => {
    const whatsappUrl = generateWhatsAppUrl(data);
    
    // Marcar como enviado com timestamp
    const newSentMessages = new Set(sentMessages);
    newSentMessages.add(index);
    setSentMessages(newSentMessages);
    
    // Obter timestamp atual
    const now = new Date();
    const timestamp = `${now.toLocaleDateString()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Atualizar detalhes da mensagem enviada
    const newSentMessagesDetails = new Map(sentMessagesDetails);
    newSentMessagesDetails.set(index, { 
      timestamp: timestamp,
      success: true
    });
    setSentMessagesDetails(newSentMessagesDetails);
    
    // Salvar no rastreador de mensagens usando identificador único
    const messageId = `${data.Localizador}-${data['Telefone Responsável']}`;
    const newMessageTracker = new Map(messageTracker);
    newMessageTracker.set(messageId, {
      timestamp: timestamp,
      success: true
    });
    setMessageTracker(newMessageTracker);
    
    // Salvar no localStorage
    saveMessagesToLocalStorage(newMessageTracker);
    
    // Definir o índice atual
    setCurrentMessageIndex(index);
    
    // Abrir o WhatsApp em uma nova aba
    window.open(whatsappUrl, '_blank');
  };

  const sendBulkWhatsApp = () => {
    const selectedData = Array.from(selectedRows).map(index => filteredData[index]);
    selectedData.forEach((data, index) => {
      setTimeout(() => {
        openWhatsApp(data, index);
      }, index * 1000); // Delay each message by 1 second to prevent blocking
    });
    setSelectedRows(new Set());
  };

  const toggleRowSelection = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const generateReportLink = async () => {
    if (!initDate || !endDate || !establishment) {
      alert('Por favor, preencha todos os campos!');
      return;
    }

    setIsLoading(true);
    setProcessingStatus('Gerando relatório...');

    const baseUrl = "https://pms.audaar.com.br/web-api/vivakey/rest/report/allestablishment/reservation/created";
    const allUnitsIds = '49,33,5,3,32,40,45,51,41,42,43,44,46,48,50';
    
    const establishmentIds = establishment === 'all' ? allUnitsIds : establishment;
    const params = new URLSearchParams({ 
      initDate, 
      endDate, 
      establishmentIds, 
      isCheckoutReport: 'false', 
      report: 'true', 
      typeReport: 'ALL' 
    });

    try {
      const response = await fetch(`${baseUrl}?${params.toString()}`);
      const data = await response.json();
      const url = data.message.split('link do relatorio: ')[1].split('"')[0];
      setReportUrl(url);
      setProcessingStatus('Relatório gerado com sucesso!');
    } catch (error) {
      alert('Erro ao gerar os relatórios. Tente novamente mais tarde.');
      setProcessingStatus('Erro ao gerar relatório');
    } finally {
      setIsLoading(false);
    }
  };

  // Função para gerar, baixar e processar o relatório em um único passo
  const generateAndProcessReport = async () => {
    if (!initDate || !endDate || !establishment) {
      alert('Por favor, preencha todos os campos!');
      return;
    }

    setIsLoading(true);
    setProcessingStatus('Gerando relatório...');

    const baseUrl = "https://pms.audaar.com.br/web-api/vivakey/rest/report/allestablishment/reservation/created";
    const allUnitsIds = '49,33,5,3,32,40,45,51,41,42,43,44,46,48,50';
    
    const establishmentIds = establishment === 'all' ? allUnitsIds : establishment;
    const params = new URLSearchParams({ 
      initDate, 
      endDate, 
      establishmentIds, 
      isCheckoutReport: 'false', 
      report: 'true', 
      typeReport: 'ALL' 
    });

    try {
      const response = await fetch(`${baseUrl}?${params.toString()}`);
      const data = await response.json();
      const url = data.message.split('link do relatorio: ')[1].split('"')[0];
      setReportUrl(url);
      
      // Baixar e processar automaticamente
      await downloadAndProcessReport(url);
      
    } catch (error) {
      alert('Erro ao gerar os relatórios. Tente novamente mais tarde.');
      setProcessingStatus('Erro ao gerar relatório');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadAndProcessReport = async (url: string) => {
    try {
      setProcessingStatus('Baixando e processando relatório automaticamente...');
      console.log('URL do relatório original:', url);
      
      // Usar um serviço de proxy CORS para contornar restrições de segurança
      // Opção 1: CORS Anywhere (https://cors-anywhere.herokuapp.com/)
      // Opção 2: AllOrigins (https://allorigins.win)
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      console.log('Tentando baixar através do proxy CORS:', proxyUrl);
      
      try {
        // Tentar baixar usando o proxy
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Erro ao baixar o relatório via proxy: ${response.status} ${response.statusText}`);
        }
        
        // Obter o blob do arquivo
        const fileBlob = await response.blob();
        
        // Verificar se o blob tem conteúdo
        if (fileBlob.size === 0) {
          throw new Error('O arquivo baixado está vazio');
        }
        
        console.log(`Arquivo baixado com sucesso via proxy. Tamanho: ${fileBlob.size} bytes`);
        setProcessingStatus('Arquivo baixado com sucesso. Processando dados...');
        
        // Criar um objeto File a partir do Blob
        const fileName = `relatorio_${initDate}_${endDate}.xlsx`;
        const file = new File([fileBlob], fileName, { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        // Mudar para a aba de filtro
        setActiveTab('filter');
        
        // Processar o arquivo diretamente
        await processFile(file);
        
        // Também criar um link para download para o usuário, caso queira salvar o arquivo
        const downloadUrl = window.URL.createObjectURL(fileBlob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        return; // Sair da função se o download via proxy funcionou
      } catch (proxyError) {
        console.error('Erro ao baixar via proxy:', proxyError);
        // Continuar para os outros métodos
      }
      
      // Método alternativo: Tentar baixar usando iframe (pode funcionar em alguns casos)
      console.log('Tentando método alternativo com iframe...');
      try {
        // Criar um iframe invisível
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        // Criar uma Promise que será resolvida quando o iframe carregar
        const iframePromise = new Promise<void>((resolve, reject) => {
          iframe.onload = () => {
            try {
              // Tentar acessar o conteúdo do iframe (pode falhar devido a CORS)
              if (iframe.contentDocument) {
                resolve();
              } else {
                reject(new Error('Não foi possível acessar o conteúdo do iframe'));
              }
            } catch (error) {
              reject(error);
            }
          };
          
          iframe.onerror = (error) => {
            reject(error);
          };
          
          // Definir um timeout para o caso de o iframe não carregar
          setTimeout(() => {
            reject(new Error('Timeout ao carregar o iframe'));
          }, 10000);
        });
        
        // Definir o src do iframe para o URL do relatório
        iframe.src = url;
        
        // Aguardar o carregamento do iframe
        await iframePromise;
        
        // Se chegou aqui, o iframe carregou com sucesso
        // Mudar para a aba de filtro e informar o usuário
        setActiveTab('filter');
        setProcessingStatus('Arquivo baixado. Por favor, selecione-o na área de upload.');
        
        // Remover o iframe
        document.body.removeChild(iframe);
        
        return; // Sair da função se o iframe funcionou
      } catch (iframeError) {
        console.error('Erro ao usar iframe:', iframeError);
        // Continuar para o próximo método
      }
      
      // Se chegou aqui, nenhum dos métodos automáticos funcionou
      // Oferecer ao usuário a opção de baixar manualmente
      if (confirm('Não foi possível processar o relatório automaticamente devido a restrições de segurança do navegador. Vamos baixar o arquivo e você poderá selecioná-lo em seguida. Deseja continuar?')) {
        // Abrir o URL em uma nova aba para download
        window.open(url, '_blank');
        
        // Mudar para a aba de filtro
        setActiveTab('filter');
        
        // Destacar visualmente a área de upload
        const fileUploadArea = document.getElementById('file-upload-area');
        if (fileUploadArea) {
          fileUploadArea.classList.add('highlight-upload');
          
          // Remover o destaque após 30 segundos
          setTimeout(() => {
            fileUploadArea.classList.remove('highlight-upload');
          }, 30000);
        }
        
        // Mostrar instruções claras
        setProcessingStatus('Após o download ser concluído, por favor, selecione o arquivo na área de upload destacada.');
        
        // Mostrar um alerta após um pequeno atraso para garantir que o download tenha iniciado
        setTimeout(() => {
          alert('O download do relatório foi iniciado em uma nova aba. Após o download ser concluído, por favor, selecione o arquivo na área de upload destacada para processá-lo.');
        }, 1000);
      }
    } catch (error) {
      console.error('Erro ao baixar e processar o relatório:', error);
      setProcessingStatus(`Erro ao processar relatório: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      
      // Oferecer ao usuário a opção de baixar manualmente
      if (confirm('Ocorreu um erro ao processar o relatório. Deseja baixar o arquivo manualmente?')) {
        window.open(url, '_blank');
        
        // Mudar para a aba de filtro
        setActiveTab('filter');
        
        // Destacar visualmente a área de upload
        const fileUploadArea = document.getElementById('file-upload-area');
        if (fileUploadArea) {
          fileUploadArea.classList.add('highlight-upload');
          
          // Remover o destaque após 30 segundos
          setTimeout(() => {
            fileUploadArea.classList.remove('highlight-upload');
          }, 30000);
        }
        
        setProcessingStatus('Por favor, selecione o arquivo baixado na área de upload destacada.');
      }
    }
  };

  const processFile = async (file: File) => {
    setProcessingStatus('Processando arquivo...');
    console.log('Iniciando processamento do arquivo:', file.name, file.size, 'bytes');
    
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          if (!event.target?.result) {
            console.error('FileReader não retornou resultado');
            setProcessingStatus('Erro: arquivo não pôde ser lido');
            reject(new Error('FileReader não retornou resultado'));
            return;
          }

          console.log('Arquivo lido com sucesso, tamanho:', (event.target.result as ArrayBuffer).byteLength, 'bytes');
          const data = new Uint8Array(event.target.result as ArrayBuffer);
          
          console.log('Configurando XLSX para leitura...');
          // Configurar o XLSX para ler datas corretamente
          const workbook = XLSX.read(data, { 
            type: 'array',
            cellDates: true, // Importante: isso faz com que as datas sejam lidas como objetos Date
            dateNF: 'dd/mm/yyyy', // Formato de data para saída
            cellNF: false,
            cellStyles: false
          });
          
          console.log('Planilhas encontradas:', workbook.SheetNames);
          if (workbook.SheetNames.length === 0) {
            console.error('Nenhuma planilha encontrada no arquivo');
            setProcessingStatus('Erro: nenhuma planilha encontrada no arquivo');
            reject(new Error('Nenhuma planilha encontrada no arquivo'));
            return;
          }
          
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          console.log('Convertendo planilha para JSON...');
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

          console.log('Dados brutos do Excel:', jsonData.length, 'linhas');
          if (jsonData.length === 0) {
            console.error('Nenhum dado encontrado na planilha');
            setProcessingStatus('Erro: nenhum dado encontrado na planilha');
            reject(new Error('Nenhum dado encontrado na planilha'));
            return;
          }
          
          console.log('Amostra de dados:', jsonData.slice(0, 2));

          console.log('Filtrando dados...');
          const filtered = jsonData.filter(row => {
            const checkinWebValue = row['Checkin Web'];
            const paymentStatus = row['Status de Pagamento'];
            
            // Verificar se as colunas necessárias existem
            if (checkinWebValue === undefined) {
              console.warn('Coluna "Checkin Web" não encontrada na linha:', row);
            }
            if (paymentStatus === undefined) {
              console.warn('Coluna "Status de Pagamento" não encontrada na linha:', row);
            }
            
            return (
              (checkinWebValue === false || 
               checkinWebValue === 'False' || 
               checkinWebValue === 0 ||
               checkinWebValue === '0') &&
              (paymentStatus === 'FULL_PAYMENT')
            );
          });

          console.log('Dados filtrados:', filtered.length, 'linhas');

          // Filtrar apenas as colunas desejadas
          const columnsToKeep = [
            'Checkin',
            'Checkout',
            'Responsável',
            'Telefone Responsável',
            'Unidade',
            'Localizador',
            'Categoria',
            'Quantidade Hóspede',
            'Documento do Responsavel',
            'Nome Estabelecimento'
          ];

          // Verificar se todas as colunas necessárias existem
          const missingColumns = columnsToKeep.filter(col => !jsonData[0] || !(col in jsonData[0]));
          if (missingColumns.length > 0) {
            console.warn('Colunas ausentes no arquivo:', missingColumns);
          }

          console.log('Processando colunas selecionadas...');
          const filteredWithSelectedColumns = filtered.map(row => {
            const newRow: any = {};
            columnsToKeep.forEach(column => {
              // Obter o valor da coluna, ou string vazia se não existir
              let value = row[column] !== undefined ? row[column] : '';
              
              // Tratamento especial para datas
              if (column === 'Checkin' || column === 'Checkout') {
                // Verificar o tipo de valor e converter adequadamente
                if (value instanceof Date) {
                  // Se já for um objeto Date, formatar para string no formato brasileiro
                  const day = String(value.getDate()).padStart(2, '0');
                  const month = String(value.getMonth() + 1).padStart(2, '0');
                  const year = value.getFullYear();
                  value = `${day}/${month}/${year}`;
                } 
                else if (typeof value === 'number') {
                  // Se for um número (data do Excel), converter para string de data
                  try {
                    const excelDate = XLSX.SSF.parse_date_code(value);
                    value = `${String(excelDate.d).padStart(2, '0')}/${String(excelDate.m).padStart(2, '0')}/${excelDate.y}`;
                  } catch (error) {
                    console.error(`Erro ao converter data Excel numérica: ${error}`);
                  }
                }
                else if (typeof value === 'string' && value.trim() !== '') {
                  // Se for uma string, tentar formatar para o padrão brasileiro
                  value = formatDateToPtBR(value);
                }
                
                console.log(`${column} processado:`, value);
              }
              
              newRow[column] = value;
            });
            return newRow as CheckInData;
          });

          console.log('Processamento concluído, atualizando estado...');
          setFilteredData(filteredWithSelectedColumns);
          setProcessingStatus(`Encontrados ${filtered.length} check-ins pendentes`);
          resolve();
        } catch (error) {
          console.error('Erro durante o processamento do arquivo:', error);
          setProcessingStatus(`Erro ao processar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
          reject(error);
        }
      };
      
      reader.onerror = (error) => {
        console.error('Erro ao ler o arquivo:', error);
        setProcessingStatus('Erro ao ler o arquivo');
        reject(error);
      };
      
      reader.readAsArrayBuffer(file);
    });
  };

  const downloadStyledExcel = async () => {
    if (filteredData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }
    
    setProcessingStatus('Gerando arquivo Excel...');
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Check-ins Pendentes');

    // Add headers
    const headers = Object.keys(filteredData[0]);
    worksheet.columns = headers.map(header => ({ 
      header, 
      key: header,
      // Definir largura mínima para cada coluna
      width: header === 'Responsável' || header === 'Nome Estabelecimento' ? 30 : 15
    }));

    // Style headers
    worksheet.getRow(1).eachCell((cell: any) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF00' }
      };
      cell.font = { bold: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Add data
    filteredData.forEach((row: any, index: number) => {
      // Criar uma cópia do objeto para não modificar o original
      const formattedRow: any = {};
      
      // Copiar todos os valores e formatar as datas
      Object.entries(row).forEach(([key, value]) => {
        if (key === 'Checkin' || key === 'Checkout') {
          // Garantir que a data seja formatada corretamente
          if (value && typeof value === 'string' && value.trim() !== '') {
            try {
              // Verificar se já está no formato dd/mm/yyyy
              if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                formattedRow[key] = value; // Já está no formato correto
              } else {
                formattedRow[key] = formatDateToPtBR(value);
              }
              
              // Log para debug
              console.log(`${key} formatado para Excel:`, formattedRow[key]);
            } catch (error) {
              console.error(`Erro ao formatar data ${key}:`, error);
              formattedRow[key] = value; // Manter o valor original em caso de erro
            }
          } else {
            formattedRow[key] = '';
          }
        } else {
          formattedRow[key] = value;
        }
      });
      
      const worksheetRow = worksheet.addRow(formattedRow);
      worksheetRow.eachCell((cell: any) => {
        // Estilo para linhas alternadas
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: index % 2 === 0 ? 'FFFFFF' : 'F3F3F3' }
        };
        
        // Bordas para todas as células
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        
        // Alinhar células com base no conteúdo
        if (cell.value && typeof cell.value === 'string') {
          if (cell.value.includes('/') || !isNaN(Number(cell.value))) {
            // Alinhar datas e números ao centro
            cell.alignment = { horizontal: 'center' };
          } else {
            // Alinhar texto à esquerda
            cell.alignment = { horizontal: 'left' };
          }
        }
      });
    });

    // Criar um nome de arquivo com data e hora
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}h${now.getMinutes().toString().padStart(2, '0')}`;
    const fileName = `checkins_pendentes_${dateStr}_${timeStr}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
    setProcessingStatus('Download concluído!');
  };

  // Função para salvar o histórico de mensagens no localStorage e Firebase
  const saveMessagesToLocalStorage = (
    messagesData: Map<string, { timestamp: string, success: boolean }>
  ) => {
    try {
      // Salvar no localStorage
      const serializedData = JSON.stringify(Array.from(messagesData.entries()));
      localStorage.setItem('sentMessagesHistory', serializedData);
      console.log('Histórico de mensagens salvo no localStorage');
      
      // Se online e autenticado, sincronizar com Firebase
      if (isOnline && isAuthenticated) {
        syncWithFirebase(messagesData);
      }
    } catch (error) {
      console.error('Erro ao salvar histórico no localStorage:', error);
    }
  };
  
  // Sincronizar dados com Firebase
  const syncWithFirebase = async (messagesData: Map<string, { timestamp: string, success: boolean }>) => {
    try {
      setSyncStatus('syncing');
      
      // Converter o mapa para um objeto para armazenar no Firebase
      const messagesObject: Record<string, { timestamp: string, success: boolean }> = {};
      messagesData.forEach((value, key) => {
        // Substituir pontos por sublinhados para evitar problemas com chaves do Firebase
        const safeKey = key.replace(/\./g, '_');
        messagesObject[safeKey] = value;
      });
      
      // Gravar no Firebase
      const messagesRef = ref(database, 'messages');
      await set(messagesRef, messagesObject);
      
      // Atualizar status de sincronização
      const now = new Date();
      const syncTime = `${now.toLocaleDateString()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setLastSyncTime(syncTime);
      setSyncStatus('synced');
      console.log('Dados sincronizados com Firebase em', syncTime);
    } catch (error) {
      console.error('Erro ao sincronizar com Firebase:', error);
      setSyncStatus('error');
    }
  };
  
  // Carregar dados do Firebase quando estiver online e autenticado
  useEffect(() => {
    if (isOnline && isAuthenticated) {
      const loadFromFirebase = async () => {
        try {
          setSyncStatus('syncing');
          console.log('Tentando carregar dados do Firebase...');
          
          const messagesRef = ref(database, 'messages');
          const snapshot = await get(messagesRef);
          
          if (snapshot.exists()) {
            const firebaseData = snapshot.val();
            console.log('Dados obtidos do Firebase:', firebaseData);
            
            // Converter do formato de objeto para Map
            const messagesMap = new Map<string, { timestamp: string, success: boolean }>();
            Object.entries(firebaseData).forEach(([key, value]) => {
              // Converter chaves de volta substituindo sublinhados por pontos
              const originalKey = key.replace(/_/g, '.');
              messagesMap.set(originalKey, value as { timestamp: string, success: boolean });
            });
            
            // Combinar com dados locais
            const localData = loadMessagesFromLocalStorage();
            const combinedData = new Map([...localData, ...messagesMap]);
            
            // Atualizar o estado
            setMessageTracker(combinedData);
            
            // Salvar a versão combinada de volta no localStorage
            localStorage.setItem('sentMessagesHistory', JSON.stringify(Array.from(combinedData.entries())));
            
            // Atualizar status e horário da sincronização
            const now = new Date();
            const syncTime = `${now.toLocaleDateString()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            setLastSyncTime(syncTime);
            setSyncStatus('synced');
            
            console.log('Dados carregados do Firebase e combinados com dados locais');
          } else {
            console.log('Nenhum dado encontrado no Firebase');
            setSyncStatus(null);
          }
        } catch (error) {
          console.error('Erro ao carregar dados do Firebase:', error);
          setSyncStatus('error');
        }
      };
      
      loadFromFirebase();
    }
  }, [isOnline, isAuthenticated]);
  
  // Tentar sincronizar quando voltar a ficar online
  useEffect(() => {
    if (isOnline && isAuthenticated && messageTracker.size > 0) {
      syncWithFirebase(messageTracker);
    }
  }, [isOnline, isAuthenticated]);

  // Função para carregar o histórico de mensagens do localStorage
  const loadMessagesFromLocalStorage = () => {
    try {
      const savedData = localStorage.getItem('sentMessagesHistory');
      if (savedData) {
        return new Map(JSON.parse(savedData));
      }
    } catch (error) {
      console.error('Erro ao carregar histórico do localStorage:', error);
    }
    return new Map();
  };

  // Carregar dados salvos quando o componente inicializa
  useEffect(() => {
    const savedMessages = loadMessagesFromLocalStorage();
    setMessageTracker(savedMessages);
    console.log('Histórico carregado do localStorage:', savedMessages.size, 'mensagens');
  }, []);

  // Função modificada para identificar mensagens já enviadas quando carregar dados
  useEffect(() => {
    if (filteredData.length > 0 && messageTracker.size > 0) {
      console.log('Verificando mensagens já enviadas...');
      const newSentMessages = new Set<number>();
      const newSentMessagesDetails = new Map<number, { timestamp: string, success: boolean }>();
      
      // Para cada linha de dados, verificar se já foi enviada mensagem
      filteredData.forEach((row, index) => {
        // Criar um identificador único para a mensagem
        const messageId = `${row.Localizador}-${row['Telefone Responsável']}`;
        
        // Verificar se existe no histórico
        if (messageTracker.has(messageId)) {
          newSentMessages.add(index);
          newSentMessagesDetails.set(index, messageTracker.get(messageId)!);
          console.log(`Mensagem já enviada encontrada: ${messageId}`);
        }
      });
      
      // Atualizar os estados
      if (newSentMessages.size > 0) {
        setSentMessages(newSentMessages);
        setSentMessagesDetails(newSentMessagesDetails);
        console.log(`${newSentMessages.size} mensagens já enviadas foram identificadas`);
      }
    }
  }, [filteredData, messageTracker]);

  // Função para enviar uma única mensagem e atualizar a interface
  const sendSingleMessage = (index: number) => {
    if (index >= 0 && index < filteredData.length) {
      const data = filteredData[index];
      
      // Marcar como enviado com timestamp
      const now = new Date();
      const timestamp = `${now.toLocaleDateString()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      const newSentMessages = new Set(sentMessages);
      newSentMessages.add(index);
      setSentMessages(newSentMessages);
      
      const newSentMessagesDetails = new Map(sentMessagesDetails);
      newSentMessagesDetails.set(index, { 
        timestamp: timestamp,
        success: true
      });
      setSentMessagesDetails(newSentMessagesDetails);
      
      // Salvar no rastreador de mensagens usando identificador único
      const messageId = `${data.Localizador}-${data['Telefone Responsável']}`;
      const newMessageTracker = new Map(messageTracker);
      newMessageTracker.set(messageId, {
        timestamp: timestamp,
        success: true
      });
      setMessageTracker(newMessageTracker);
      
      // Salvar no localStorage
      saveMessagesToLocalStorage(newMessageTracker);
      
      // Definir o índice atual para destacar na interface
      setCurrentMessageIndex(index);
      
      // Abrir o WhatsApp em uma nova aba
      const whatsappUrl = generateWhatsAppUrl(data);
      window.open(whatsappUrl, '_blank');
    }
  };

  // Função para limpar o histórico
  const clearSentHistory = () => {
    if (confirm('Tem certeza que deseja limpar todo o histórico de mensagens? Esta ação não pode ser desfeita.')) {
      setSentMessages(new Set());
      setSentMessagesDetails(new Map());
      setMessageTracker(new Map());
      setCurrentMessageIndex(null);
      
      // Limpar do localStorage
      localStorage.removeItem('sentMessagesHistory');
      alert('Histórico de mensagens limpo com sucesso.');
    }
  };

  // Nova função para enviar próxima mensagem ainda não enviada
  const sendNextPendingMessage = () => {
    if (filteredData.length === 0) {
      alert('Não há dados para enviar mensagens.');
      return;
    }

    // Encontrar o próximo índice não enviado
    let nextIndex = -1;
    for (let i = 0; i < filteredData.length; i++) {
      if (!sentMessages.has(i)) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex === -1) {
      alert('Todas as mensagens já foram enviadas!');
      return;
    }

    // Enviar a próxima mensagem
    sendSingleMessage(nextIndex);
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <style>
        {`
        .highlight-upload {
          border: 2px dashed #4299e1;
          background-color: rgba(66, 153, 225, 0.1);
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(66, 153, 225, 0.4);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(66, 153, 225, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(66, 153, 225, 0);
          }
        }
        `}
      </style>
      
      <nav className="bg-[#228a7d] fixed top-0 left-0 w-full px-6 py-4 shadow-md z-50 flex justify-between items-center">
        <a href="https://planbcoin.site/previa.html" className="text-white text-lg font-bold hover:text-gray-200 transition-colors">
          SISTEMA DE CHECK-IN 📝
        </a>
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <span className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></span>
            <span className="text-white text-xs">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          {isAuthenticated && (
            <div className="flex items-center">
              <span className={`w-2 h-2 rounded-full mr-2 ${
                syncStatus === 'synced' ? 'bg-green-400' : 
                syncStatus === 'syncing' ? 'bg-yellow-400' : 
                syncStatus === 'error' ? 'bg-red-400' : 'bg-gray-400'
              }`}></span>
              <span className="text-white text-xs">
                {syncStatus === 'synced' ? 'Sincronizado' : 
                 syncStatus === 'syncing' ? 'Sincronizando...' : 
                 syncStatus === 'error' ? 'Erro de sinc.' : 'Não sincronizado'}
              </span>
            </div>
          )}
          <div className="text-white text-sm">
            Versão 1.1
          </div>
        </div>
      </nav>

      {/* Adicionar notificação quando estiver offline */}
      {!isOnline && (
        <div className="fixed top-16 left-0 w-full bg-red-500 text-white text-center py-1 px-4 z-40 flex items-center justify-center">
          <span className="text-sm">
            Você está offline. Os dados serão salvos localmente e sincronizados quando a conexão for restaurada.
          </span>
        </div>
      )}
      
      {/* Adicionar informação sobre última sincronização */}
      {isAuthenticated && lastSyncTime && (
        <div className="fixed top-16 left-0 w-full bg-blue-500 text-white text-center py-1 px-4 z-30">
          <span className="text-xs">Última sincronização: {lastSyncTime}</span>
        </div>
      )}

      <div className={`container mx-auto p-4 ${!isOnline || (isAuthenticated && lastSyncTime) ? 'mt-24' : 'mt-16'}`}>
        <div className="bg-white rounded-lg shadow-lg p-6">
          {processingStatus && (
            <div className="mb-6 p-4 bg-blue-50 text-blue-700 rounded-md flex items-center gap-2 border border-blue-200">
              {isLoading || isSendingBulk ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              <span className="font-medium">{processingStatus}</span>
              {isSendingBulk && (
                <div className="w-full mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${sendingProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab('report')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                activeTab === 'report' 
                  ? 'bg-[#228a7d] text-white shadow-md' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Gerar Relatório
            </button>
            <button
              onClick={() => setActiveTab('filter')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                activeTab === 'filter' 
                  ? 'bg-[#228a7d] text-white shadow-md' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Filtrar Arquivo
            </button>
          </div>

          {activeTab === 'report' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="initDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Data Inicial:
                </label>
                <input
                  type="date"
                  id="initDate"
                  value={initDate}
                  onChange={(e) => setInitDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#228a7d] focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Data Final:
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#228a7d] focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="establishment" className="block text-sm font-medium text-gray-700 mb-1">
                  Selecione o Estabelecimento:
                </label>
                <select
                  id="establishment"
                  value={establishment}
                  onChange={(e) => setEstablishment(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#228a7d] focus:border-transparent"
                >
                  <option value="all">Todas as Unidades</option>
                  <optgroup label="Unidades Audaar">
                    <option value="49">Audaar tech</option>
                    <option value="33">Rock Blue Ocean</option>
                    <option value="5">Rock Suites CGH</option>
                    <option value="3">Club Suítes</option>
                  </optgroup>
                  <optgroup label="Apartamentos">
                    <option value="32">Apartamentos Vivaap</option>
                    <option value="40">Residencial Anchieta - Riviera</option>
                  </optgroup>
                  <optgroup label="Outra unidades">
                    <option value="45">Room 4 You</option>
                    <option value="51">Hotel Brooklin</option>
                  </optgroup>
                  <optgroup label="Unidades Lobie">
                    <option value="41">Lobie Botafogo</option>
                    <option value="42">Lobie Barra</option>
                    <option value="43">Lobie Nova Iguaçu</option>
                    <option value="44">Lobie Ipanema</option>
                    <option value="46">Lobie Copacabana</option>
                    <option value="48">Lobie Mediterrâneo</option>
                    <option value="50">Lobie São Joaquim</option>
                  </optgroup>
                </select>
              </div>

              <button
                onClick={generateReportLink}
                disabled={isLoading}
                className="w-full bg-[#228a7d] text-white py-3 px-4 rounded-md hover:bg-[#1a6b62] transition-colors flex items-center justify-center gap-2 mb-3"
              >
                <FileSpreadsheet className="w-5 h-5" />
                {isLoading ? 'Gerando...' : 'Gerar Relatório'}
              </button>

              <button
                onClick={generateAndProcessReport}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-5 h-5" />
                {isLoading ? 'Processando...' : 'Gerar e Processar Automaticamente'}
              </button>

              {reportUrl && (
                <div className="mt-6 p-4 bg-green-50 border-2 border-[#228a7d] rounded-lg">
                  <p className="text-gray-700 mb-3">Seu link foi gerado:</p>
                  <a
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#228a7d] text-white py-2 px-4 rounded-md hover:bg-[#1a6b62] transition-colors"
                  >
                    <Send className="w-5 h-5" />
                    Baixar Relatório
                  </a>
                </div>
              )}
            </div>
          )}

          {activeTab === 'filter' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-[#228a7d] transition-colors"
                id="file-upload-area"
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) processFile(file);
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  type="file"
                  id="file-upload"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processFile(file);
                  }}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Arraste e solte aqui ou clique para selecionar</p>
                </label>
              </div>

              {filteredData.length > 0 && (
                <>
                  <div className="mb-4 flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      {filteredData.length} check-ins pendentes encontrados
                    </span>
                    <div className="flex gap-2">
                      {selectedRows.size > 0 && (
                        <button
                          onClick={sendBulkWhatsApp}
                          className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors flex items-center gap-2"
                          disabled={isSendingBulk}
                        >
                          <MessageSquare className="w-4 h-4" />
                          Enviar WhatsApp ({selectedRows.size})
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedRows.size === filteredData.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRows(new Set(filteredData.map((_, i) => i)));
                                  } else {
                                    setSelectedRows(new Set());
                                  }
                                }}
                                className="rounded border-gray-300"
                              />
                              <span className="text-xs text-gray-500">Todos</span>
                            </div>
                          </th>
                          {Object.keys(filteredData[0]).map((header) => (
                            <th
                              key={header}
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {header}
                            </th>
                          ))}
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredData.map((row, index) => (
                          <tr 
                            key={index} 
                            className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                              sentMessages.has(index) ? 'bg-green-50' : ''
                            } ${
                              currentMessageIndex === index ? 'bg-blue-50' : ''
                            }`}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(index)}
                                onChange={() => toggleRowSelection(index)}
                                className="rounded border-gray-300"
                                disabled={isSendingBulk}
                              />
                            </td>
                            {Object.entries(row).map(([key, value], cellIndex) => (
                              <td 
                                key={cellIndex} 
                                className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                              >
                                {value}
                              </td>
                            ))}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => openWhatsApp(row, index)}
                                  className={`${
                                    sentMessages.has(index) 
                                      ? 'text-gray-400' 
                                      : 'text-green-500 hover:text-green-700'
                                  } transition-colors`}
                                  disabled={isSendingBulk}
                                  title={sentMessages.has(index) ? "Mensagem já enviada" : "Enviar mensagem"}
                                >
                                  <MessageSquare className="w-5 h-5" />
                                </button>
                                {sentMessages.has(index) && (
                                  <span className="text-green-500 text-xs">
                                    <Check className="w-4 h-4" />
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={downloadStyledExcel}
                      className="flex-1 bg-[#228a7d] text-white py-3 px-4 rounded-md hover:bg-[#1a6b62] transition-colors flex items-center justify-center gap-2"
                      disabled={isSendingBulk}
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                      Baixar Arquivo Atualizado
                    </button>
                    
                    <button
                      onClick={sendNextPendingMessage}
                      className="flex-1 bg-blue-500 text-white py-3 px-4 rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                      disabled={isSendingBulk || filteredData.length === 0 || 
                                sentMessages.size === filteredData.length}
                    >
                      <MessageSquare className="w-5 h-5" />
                      Enviar Próxima Mensagem
                    </button>
                  </div>

                  {selectedRows.size > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex items-center justify-between">
                        <span className="text-blue-700 text-sm">
                          {selectedRows.size} contato{selectedRows.size > 1 ? 's' : ''} selecionado{selectedRows.size > 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={sendBulkWhatsApp}
                          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
                          disabled={isSendingBulk}
                        >
                          <Send className="w-4 h-4" />
                          Enviar para Selecionados
                        </button>
                      </div>
                    </div>
                  )}

                  {sentMessages.size > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Progresso de envio</span>
                        <span>{sentMessages.size}/{filteredData.length} ({Math.round((sentMessages.size / filteredData.length) * 100)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${(sentMessages.size / filteredData.length) * 100}%` }}></div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {filteredData.length > 0 && activeTab === 'filter' && (
            <div className="my-6">
              <button 
                onClick={() => setShowMessageHistory(!showMessageHistory)}
                className="mb-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded inline-flex items-center"
              >
                {showMessageHistory ? 'Ocultar' : 'Mostrar'} Histórico de Mensagens {sentMessages.size > 0 && `(${sentMessages.size}/${filteredData.length})`}
              </button>

              {showMessageHistory && (
                <div className="bg-white rounded-lg shadow-md p-5 max-h-96 overflow-auto border border-gray-200" ref={messageContainerRef}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Histórico de Mensagens</h3>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-500 mr-4">
                        {sentMessages.size} de {filteredData.length} mensagens enviadas
                      </span>
                      <button 
                        onClick={clearSentHistory} 
                        className="text-red-500 text-sm hover:text-red-700 disabled:opacity-50 border border-red-200 hover:border-red-500 px-2 py-1 rounded"
                        disabled={sentMessages.size === 0}
                      >
                        Limpar Histórico
                      </button>
                    </div>
                  </div>
                  
                  {sentMessages.size === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>Nenhuma mensagem enviada ainda.</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Responsável</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telefone</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Localizador</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estabelecimento</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-in</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enviado em</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {Array.from(sentMessages).map(index => {
                            const details = sentMessagesDetails.get(index);
                            return (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-green-500">
                                    <Check className="w-5 h-5" />
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <User className="w-4 h-4 mr-2 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-900">
                                      {filteredData[index].Responsável}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <Phone className="w-4 h-4 mr-2 text-gray-400" />
                                    <span className="text-sm text-gray-500">
                                      {filteredData[index]['Telefone Responsável']}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                                    <span className="text-sm text-gray-500">
                                      {filteredData[index].Localizador}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="text-sm text-gray-500">
                                    {filteredData[index]['Nome Estabelecimento']}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                                    <span className="text-sm text-gray-500">
                                      {formatDateToPtBR(filteredData[index].Checkin)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <Clock className="w-4 h-4 mr-2 text-gray-400" />
                                    <span className="text-sm text-gray-500">
                                      {details?.timestamp || 'N/A'}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 w-full bg-[#228a7d] text-white text-center py-3 text-sm">
        © 2025. Desenvolvido por <strong>OJ</strong> |{' '}
        <a href="https://planbcoin.site" target="_blank" rel="noopener noreferrer" className="text-yellow-300 hover:underline">
          PlanBCoin
        </a>
      </footer>
    </div>
  );
}