import { Injectable, Logger } from '@nestjs/common';

import { BehaviorSubject } from 'rxjs';

import { NodeClient, WalletClient, Network } from 'litedoge';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private walletClient;
  private client;

  constructor(private configService: ConfigService) {
    const network = Network.get('main');

    const walletOptions = {
      network: network.type,
      port: network.walletPort,
      apiKey: this.configService.get<string>('WALLET_API_KEY'),
    };
    const clientOptions = {
      network: network.type,
      port: network.rpcPort,
      apiKey: this.configService.get<string>('WALLET_API_KEY'),
    };

    this.walletClient = new WalletClient(walletOptions);
    this.client = new NodeClient(clientOptions);

    (async () => {
      const watchOnlyId = 'watchOnly';
      const result = await this.walletClient.createWallet(watchOnlyId, {
        witness: false,
        watchOnly: true,
      });
      Logger.warn('watch only wallet');
      Logger.warn(result);
      const watchOnlySelectResult = await this.walletClient.execute(
        'selectwallet',
        [watchOnlyId],
      );
      Logger.warn(watchOnlySelectResult);
    })();
  }

  getUnspent(address: string): BehaviorSubject<any> {
    const unspent$ = new BehaviorSubject(null);
    this.walletClient.execute('importaddress', [address]).then(
      () => {
        // Execute after import
        this.walletClient.execute('listunspent', [5, 9999999, [address]]).then(
          (result) => {
            unspent$.next(result);
          },
          (err) => {
            unspent$.next([]);
            Logger.error('error retrieving listunspent');
            Logger.error(err);
          },
        );
      },
      (err) => {
        unspent$.next([]);
        Logger.error('error executing importaddress');
        Logger.error(err);
      },
    );

    return unspent$;
  }

  pushTransaction(transactionHex: string) {
    this.client.execute('sendrawtransaction', [transactionHex]);
  }
}
