import { Injectable, Logger } from '@nestjs/common';

import { BehaviorSubject } from 'rxjs';

import { NodeClient, WalletClient, Network } from 'ldogejs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private walletClient;
  private client;
  private accountId = 'default';
  private watchOnlyId = 'watchOnly';
  private watchOnlyWallet;

  constructor(private configService: ConfigService) {
    const network = Network.get('main');

    const walletOptions = {
      network: network.type,
      port: network.walletPort,
      timeout: 10000,
      apiKey: this.configService.get<string>('WALLET_API_KEY'),
    };
    const clientOptions = {
      network: network.type,
      port: network.rpcPort,
      timeout: 10000,
      apiKey: this.configService.get<string>('WALLET_API_KEY'),
    };

    this.walletClient = new WalletClient(walletOptions);
    this.client = new NodeClient(clientOptions);

    (async () => {
      Logger.warn('retrieving primary account');
      const primaryId = 'primary';
      const mainAccount = 'default';
      const wallet = this.walletClient.wallet(primaryId);
      const accountRetrieved = await wallet.getAccount(mainAccount);

      const watchOnlyWallet = this.walletClient.wallet(this.watchOnlyId);
      if (!watchOnlyWallet) {
        Logger.warn('creating watch only wallet');
        this.watchOnlyWallet = await this.walletClient.createWallet(
          this.watchOnlyId,
          {
            accountKey: accountRetrieved.accountKey,
            witness: false,
            watchOnly: true,
          },
        );
      } else {
        this.watchOnlyWallet = watchOnlyWallet;
      }
      Logger.warn('selecting watch only wallet');
      await this.walletClient.execute('selectwallet', [this.watchOnlyId]);
      Logger.warn('watch only process completed');
    })();
  }

  getUnspent(address: string): BehaviorSubject<any> {
    const minConf = 3;
    const unspent$ = new BehaviorSubject(null);
    this.client.execute('validateaddress', [address]).then(
      (validationResult) => {
        if (validationResult.isvalid) {
          this.watchOnlyWallet.importAddress(this.accountId, address).then(
            () => {
              Logger.warn('imported');
            },
            (err) => {
              Logger.error('error executing importaddress');
              Logger.error(err);
            },
          );
          this.walletClient
            .execute('listunspent', [minConf, 9999999, [address]])
            .then(
              (result) => {
                unspent$.next(result);
              },
              () => {
                unspent$.next([]);
              },
            );
        } else {
          unspent$.next([]);
        }
      },
      () => {
        unspent$.next([]);
      },
    );

    return unspent$;
  }

  pushTransaction(transactionHex: string): BehaviorSubject<string> {
    const transactionResult$ = new BehaviorSubject(null);
    this.client.execute('sendrawtransaction', [transactionHex]).then(
      (result) => {
        transactionResult$.next(result);
      },
      () => {
        transactionResult$.next('');
      },
    );

    return transactionResult$;
  }
}
