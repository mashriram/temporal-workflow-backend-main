import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EnvironmentVariable } from './environment-variable.entity';

// Exactly like a Postman Environment: a freeform name ('dev', 'qa', 'perf',
// 'my-laptop', anything) holding an arbitrary set of key/value variables.
// Nothing here hardcodes any particular environment name or variable set.
@Entity('environments')
export class Environment {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  // Scopes environments to a user once auth (Phase 7) lands. Nullable for
  // now so existing single-user dev setups keep working.
  @Column({ type: 'varchar', nullable: true })
  ownerId: string | null;

  @Column()
  name: string;

  @OneToMany(() => EnvironmentVariable, (v) => v.environment, {
    cascade: true,
  })
  variables: EnvironmentVariable[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
