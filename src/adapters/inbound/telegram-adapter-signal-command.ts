// This file contains the implementation of the /signal command for TelegramAdapter
// It will be imported into the main adapter file

import { getTradeSignal, formatSignalMessage, scanMultipleCoins, formatMultipleSignalsMessage } from '../../services/telegram-signal';

/**
 * Implementation of the signal command
 * Uses multithreaded processing when available
 */
export async function handleSignalCommand(ctx: any, botCtx: any, signalTasks: any, dependencies: any) {
  // Check if the message has text and extract the parts
  const messageText = 'text' in ctx.message! ? ctx.message.text : '';
  const parts = messageText?.split(' ');
  
  // If no symbol is specified, scan multiple coins
  if (!parts || parts.length < 2) {
    await ctx.reply('🔍 <b>Scanning the market for opportunities...</b>\nThis will take a moment.', {
      parse_mode: 'HTML'
    });
    
    try {
      // Decision: Use task-based processing if available, otherwise direct processing
      let results;
      
      if (signalTasks) {
        // Use task-based multithreaded processing
        const scanResponse = await signalTasks.scanMarket(8, 5000000, 50);
        
        if (!scanResponse || !scanResponse.opportunities || scanResponse.opportunities.length === 0) {
          await ctx.reply('❌ Could not generate trading signals. Please try again later.');
          return;
        }
        
        // Convert scan response to expected format for message formatter
        results = scanResponse.opportunities.map(opp => ({
          symbol: opp.symbol,
          signal: {
            action: opp.score > 0.7 ? 'BUY' : opp.score < 0.3 ? 'SELL' : 'HOLD',
            confidence: opp.score,
            reasoning: opp.recommendation
          }
        }));
      } else {
        // Use direct processing (legacy method)
        results = await scanMultipleCoins(8, 1000);
        
        if (results.length === 0) {
          await ctx.reply('❌ Could not generate trading signals. Please try again later.');
          return;
        }
      }
      
      // Format message with multiple signals
      const signalsMessage = formatMultipleSignalsMessage(results);
      
      // Generate buttons for actionable signals
      const actionableSignals = results
        .filter(r => r.signal.action !== 'HOLD')
        .slice(0, 5); // Limit to 5 buttons
      
      let inlineKeyboard;
      if (actionableSignals.length > 0) {
        inlineKeyboard = {
          inline_keyboard: [
            ...actionableSignals.map(result => [{
              text: `📊 Details ${result.symbol}`,
              callback_data: `signal_${result.symbol}`
            }]),
            [{ 
              text: '🔄 Refresh Signals', 
              callback_data: 'refresh_all_signals' 
            }]
          ]
        };
      } else {
        inlineKeyboard = {
          inline_keyboard: [
            [{ 
              text: '🔄 Refresh Signals', 
              callback_data: 'refresh_all_signals' 
            }]
          ]
        };
      }
      
      // Send message with all signals
      await ctx.reply(signalsMessage, { 
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard
      });
    } catch (error) {
      console.error('Error scanning multiple coins:', error);
      await ctx.reply('❌ Error scanning the market. Please try again later.');
    }
    return;
  }
  
  // If symbol is specified, generate individual signal
  let symbol = parts[1].toUpperCase();
  // Add USDT if no complete pair is specified
  if (!symbol.includes('USDT') && !symbol.includes('/')) {
    symbol = `${symbol}USDT`;
  }
  
  try {
    // Send waiting message
    const waitMessage = await ctx.reply('🔮 <b>Generating trading signal...</b>\nThis may take up to 15 seconds.', {
      parse_mode: 'HTML'
    });
    
    // Decision: Use task-based processing if available, otherwise direct processing
    let signal;
    
    if (signalTasks) {
      // Use task-based multithreaded processing
      signal = await signalTasks.generateSignal(symbol, 1000, 'medium');
    } else {
      // Use direct processing (legacy method)
      signal = await getTradeSignal(symbol, 1000);
    }
    
    if (!signal) {
      await ctx.reply(`❌ Could not generate signal for ${symbol}. Please check that the symbol is valid.`);
      return;
    }
    
    // Save current symbol in session for later use
    botCtx.session.currentSymbol = symbol;
    
    // Format signal message
    const signalMessage = formatSignalMessage(symbol, signal);
    
    // Inline options for additional actions
    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '📊 View Price', callback_data: `price_${symbol}` },
          { text: '💰 Execute', callback_data: `execute_${signal.action.toLowerCase()}_${symbol}` }
        ],
        [
          { text: '🔄 Refresh Signal', callback_data: `refresh_signal_${symbol}` }
        ]
      ]
    };
    
    // Send message with the signal
    await ctx.reply(signalMessage, { 
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard
    });
  } catch (error) {
    console.error(`Error generating signal for ${symbol}:`, error);
    await ctx.reply(`❌ Error generating signal for ${symbol}. Please try again later.`);
  }
}